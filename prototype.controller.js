/** Prototype changes to controllers */

/** Global Reset Checks */
if(Memory.controllers == undefined) { Memory.controllers = {}; }

Object.defineProperties(StructureController.prototype, {
    memory: {
        get: function() { return Memory.controllers[this.name] || {}; },
        set: function(value) { Memory.controllers[this.name] = value; }
    },
    name: {
        get: function() { if(!this._name) { this._name = this.room.name; } return this._name; }
    },
    roomList: {
        get: function() {
            if(!this.memory.roomList) {
                let rooms = _roomMapper(this.name, 9, false, true);
                this.memory.roomList = rooms.toString();
            }
            let roomArray = this.memory.roomList;
            return roomArray.split(',');
        }
    },
    activeRooms: {
        get: function() {
            if (!this._activeRooms) {
                let activeRooms = [];
                for (let room in Game.rooms) {
                    if (this.roomList.includes(room)) { activeRooms.push(room); }
                }
                this._activeRooms = activeRooms;
            }

            return this._activeRooms;
        }
    },
    creeps: {
        get: function() {
            if (!this._creeps) {
                let creeps = {};
                for (let name in Game.creeps) {
                    if (this.activeRooms.includes(Game.creeps[name].room.name)) {
                        creeps[name] = Game.creeps[name];
                    }
                }
                this._creeps = creeps;
            }
            return this._creeps;
        }
    },
    rooms: {
        get: function() {
            if (!this._rooms) {
                let rooms = {};
                for (let roomName of this.activeRooms) {
                    rooms[roomName] = Game.rooms[roomName];
                }
                this._rooms = rooms;
            }
            return this.rooms;
        }
    },
    flags: {
        get: function() {
            if (!this._flags) {
              let flags = [];
              for (let room in this.rooms) {
                flags = flags.concat(this.rooms[room].flags);
              }
              this._flags = flags;
            }
            return this._flags;
          }
    },
    structures: {
        get: function() {
            if(!this._structures) {
              let structures = [];
              for (let room in this.rooms){
                structures = structures.concat(this.rooms[room].find(FIND_STRUCTURES, {
                  filter: s => (s.my == true && s.structureType != STRUCTURE_CONTROLLER) ||
                                (s.structureType == STRUCTURE_ROAD || s.structureType == STRUCTURE_WALL || s.structureType == STRUCTURE_CONTAINER)
                }));
              }
              this._structures = structures;
            }
            return this._structures;
          }
    },
    constructionSites: {
        get: function() {
            if (!this._constructionSites) {
                let constructionSites = [];
                for (let room in this.rooms) {
                    constructionSites.push(...this.rooms[room].find(FIND_MY_CONSTRUCTION_SITES));
                }
                this._constructionSites = constructionSites;
            }
            return this._constructionSites;
        }
    },
    spawns: {
        get: function() {
            if (!this._spawns) {
                let spawns = {};
                for (let spawn in Game.spawns) {
                    if (this.activeRooms.includes(Game.spawns[spawn].room.name)) {
                        spawns[spawn] = Game.spawns[spawn];
                    }
                }
                this._spawns = spawns;
            }
            return this._spawns;
        }
    },
    run: function() {


    },
    dispatchCreeps: function() {
        let startCPU = Game.cpu.getUsed();
        let idleCreeps = [];
        let workableTasks = [];
        let possibleTasks = [];
        let possibleTargets = [];
        let assignableTasks = [];
        let assignableCreeps = [];
        let assignableTargets = [];
        // find idleCreeps or return busy
        idleCreeps = _.filter(_.values(this.creeps), creep => creep.isIdle && !creep.spawning);
        if (!idleCreeps) { return ERR_BUSY; }
        // find workableTasks the idleCreeps can do or return busy
        idleCreeps.forEach((c) => workableTasks.push(_.keysIN(c.validWorkableTasks)));
        if (workableTasks.length == 0) { return ERR_BUSY; }
        // find all the possible tasks and targets, or return invalid target
        for (let room in this.rooms) {
            possibleTasks.push(...room.lookupTargetTasks().Tasks);
            possibleTargets.push(...room.lookupTargetTasks().Targets);
        }
        if (possibleTasks.length == 0 || possibleTargets.length == 0) { return ERR_INVALID_TARGET; }
        // find the unique tasks that are possible, and workable, these are assignable
        possibleTasks = _.uniq(possibleTasks.flat(Infinity));
        workableTasks = _.uniq(workableTasks.flat(Infinity));
        assignableTasks = _.intersection(workableTasks, possibleTasks);
        if (assignableTasks.length == 0 ) { return ERR_BUSY; }
        // make sure that we only are working with the creeps that can be assigned one of the assignableTasks
        assignableCreeps = idleCreeps.filter((c) => assignableTasks.some(el => _.has(c.validWorkableTasks, el)));
        if (assignableCreeps.length == 0) { return ERR_BUSY; }
        // make sure that we are only working with the targets that can assigned one of the assignableTasks
        assignableTargets = possibleTargets.filter((t) => assignableTasks.some(el => _.has(t.possibleNeededTasks, el)));
        if (assignableTargets.length == 0) { return ERR_INVALID_TARGET; }
        // Build a 3D matrix with x as creeps, y as targets, and z as tasks
        // This matrix as a priority in each cell, and we will find that cell, the xyz, and use that to assign tasks
        // this will also build a slightly separate 2D matrix of the just the amount of work queued
        let priorityMatrix = [];
        let workQueuedMatrix = [];
        for (let x = 0; x < assignableCreeps.length; x++) {
            priorityMatrix[x] = [];
            for (let y = 0; y < assignableTargets.length; y++) {
                priorityMatrix[x][y] = [];
                workQueuedMatrix[y] = [];
                for (let z = 0; z < assignableTasks.length; z++) {
                    workQueuedMatrix[y][z] = 0;
                    let tempPriority = _calcPriority(assignableTargets[y], assignableCreeps[x], assignableTasks[z]);
                    priorityMatrix[x][y][z] = !isNaN(tempPriority) ? tempPriority : ERR_INVALID_ARGS;
                }
            }
        }

        // Assign highest priority tasks to creeps, until there are no creeps or the highest priority is <= 0 (err_message)
        let counts = {
            success: 0,
            creeps: assignableCreeps.length,
            targets: assignableTargets.length,
            tasks: assignableTasks.length,
            assignedTasks: [],
        };
        let status = OK;
        while (assignableCreeps.length > 0) {
            // find highest priority, if it is <= 0 there is nothing to be done and we break
            let highestPriority = priorityMatrix.flat(Infinity).reduce((a, b) => { return a > b ? a : b; });
            if (highestPriority <= 0 ) { status = highestPriority; break; }
            // find where the highest priority was in the 3D matrix, this tells us the creep, target, and task combo
            let [x, y, z] = _getIndexPathOf(priorityMatrix, highestPriority);
            // assign to the creep, add the work that creep will do to the workQueuedMatrix
            assignableCreeps[x].task = Task[assignableTasks[z]](assignableTargets[y]);
            workQueuedMatrix[y][z] += assignableCreeps[x][assignableTasks[z]].workCanDo;
            // remove the creep from assignableCreeps (loop tracking) and the priorityMatrix
            assignableCreeps.splice(x, 1);
            priorityMatrix.splice(x, 1);
            // update that specific task/target combo priority for all remaining creeps
            for (let a = 0; a < assignableCreeps.length; a++) {
                let tempPriority = _calcPriority(assignableTargets[y], assignableCreeps[a], assignableTasks[z], workQueuedMatrix[y],[z]);
                priorityMatrix[a][y][z] = !isNaN(tempPriority) ? tempPriority : ERR_INVALID_ARGS;
            }
            counts.success += 1;
            counts.assignedTasks.push(assignableTasks[z]);
        };
        counts.assignedTasks = _.uniq(counts.assignedTasks);
        let usedCPU = Game.cpu.getUsed() - startCPU;
        let statusMessage = "INFO: " + this.name + " used " + usedCPU + " CPU to assign "
            + counts.assignedTasks.length + ' tasks across ' + counts.creeps + ' creeps and '
            + counts.targets + ' targets from ' + counts.tasks + ' total actionable tasks. '
            + 'The Assigned tasks where: ' + counts.assignedTasks;
        console.log(statusMessage);
        return status;
    },
});

function _calcPriority() {}

/** Finds the Index of Multidimensional Array value (returns first matching value as an array of coordinates)
* @param {Array} arr - the input array
* @param {number|string} k - the value to search
* @returns {number[]} The x, y, z ... of the requested value
*/
function _getIndexPathOf() {
    // If we're not array, return null;
    if (!Array.isArray(arr)) {
    return null;
    }

    // If our item is directly within our current
    // array, return it's index as an array.
    var shallowIndex = arr.indexOf(k);
    if (shallowIndex > -1)
    return [shallowIndex];

    // Search through our current array, recursively
    // calling our getIndexPathOf with the current value.
    for (var i = 0, l = arr.length; i < l; i++) {
        var path = this._getIndexPathOf(arr[i], k);
        if (path != null) {
            // If we found the path, prepend the current index
            // and return.
            path.unshift(i);
            return path;
        }
    }

    // If nothing was found, return null.
    return null;
}

/** Given a roomName and a maxDistance from roomName, generates a array of room names within the maxDistance
     * @param {string} roomName
     * @param {number} maxDistance
     * @param {boolean} [countSK = false]
     * @param {boolean} [countHighway = false]
     * @returns {array} array of roomNames
     */
function _roomMapper(roomName, maxDistance, countSK = false, countHighway = false) {
     //this function builds an array of rooms that are pathable with
    //a distance <= maxDistance.
    let roomList = [];
    let currentDistance = 0;
    let startingRoom = roomName;
    roomList.push(roomName);

    function scanning(roomName, maxDistance, currentDistance, startingRoom, countSK, countHighway) {
    //this recursive function is going to use an the passed currentDistance
    //until that distance == maxDistance, then it is going to recheck the
    //distance to see if there is a closer path
    currentDistance++;
    //check to see if we are at max distance
    if (currentDistance == maxDistance) {
        //get the path from startingRoom to this room
        let path = Game.map.findRoute(startingRoom, roomName);
        let pathDistance;
        //max sure we got a path
        if (path != -2) {
        //get the path distance
        pathDistance = path.length;
        //check to see if the path to this room is less then the tracked distance
        if (pathDistance < currentDistance) {
            //if the path distance is less then the current distance, reset currentDistance
            //to pathDistance
            currentDistance = pathDistance;
        }
        }
    }

    //now make sure we can reach the next rooms
    if (currentDistance < maxDistance) {
        //get the exits
        let adjacentExits = Game.map.describeExits(roomName);
        //convert exits to room names
        let currentScan = Object.keys(adjacentExits)
                                .map(function(key) {
                                return adjacentExits[key];
                                });

        //for each name found, add the room
        currentScan.forEach(roomName => {
        //checks to make sure it is not in the list, and it is a normal room
        let count = false
        let roomType = _getRoomType(roomName);
        if (!roomList.includes(roomName) && Game.map.getRoomStatus(roomName).status == 'normal') {
            count = true;
        }
        if (count && !countSK && roomType == ROOM_SOURCE_KEEPER) {
            count = false;
        }
        if (count && !countHighway && (roomType == ROOM_CROSSROAD || roomType == ROOM_HIGHWAY)) {
            count = false;
        }
        if (count) {
            //add the room to the list
            roomList.push(roomName);
            //scan the room
            scanning(roomName, maxDistance, currentDistance, startingRoom, countSK, countHighway);
        }
        });
    }
    }//end of scanning

    scanning(roomName, maxDistance, currentDistance, startingRoom, countSK, countHighway);
    return roomList;
}

function _getRoomType(roomName) {
    const [EW, NS] = roomName.match(/\d+/g)
    if (EW%10 == 0 && NS%10 == 0) {
        return ROOM_CROSSROAD
    }
        else if (EW%10 == 0 || NS%10 == 0) {
        return ROOM_HIGHWAY
    }
    else if (EW%5 == 0 && NS%5 == 0) {
        return ROOM_CENTER
    }
    else if (Math.abs(5 - EW%10) <= 1 && Math.abs(5 - NS%10) <= 1) {
        return ROOM_SOURCE_KEEPER
    }
    else {
        return ROOM_STANDARD
    }
}