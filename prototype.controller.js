/** Prototype changes to controllers */
var lib = require('./lib.lib');

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
                let rooms = lib.roomMapper(this.name, 9, false, true);
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
        }
        while (assignableCreeps.length > 0) {
            // find highest priority, if it is <= 0 there is nothing to be done and we break
            let highestPriority = priorityMatrix.flat(Infinity).reduce((a, b) => { return a > b ? a : b; });
            if (highestPriority <= 0 ) { break; }
            // find where the highest priority was in the 3D matrix, this tells us the creep, target, and task combo
            let [x, y, z] = lib.getIndexPathOf(priorityMatrix, highestPriority);
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
        }
    }
})