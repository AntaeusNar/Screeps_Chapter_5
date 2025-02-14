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
        let { workableTasks, possibleTasks, possibleTargets, assignableTasks } = [];
        let idleCreeps = _.filter(_.values(this.creeps), creep => creep.isIdle && !creep.spawning);
        if (!idleCreeps) { return ERR_BUSY; }

        idleCreeps.forEach((c) => workableTasks.push(_.keysIN(c.validWorkableTasks)));
        if (workableTasks.length == 0) { return ERR_BUSY; }

        for (let room in this.rooms) {
            possibleTasks.push(...room.lookupTargetTasks().Tasks);
            possibleTargets.push(...room.lookupTargetTasks().Targets);
        }
        if (possibleTasks.length == 0 || possibleTargets.length == 0) { return ERR_INVALID_TARGET; }

        possibleTasks = _.uniq(possibleTasks.flat(Infinity));
        workableTasks = _.uniq(workableTasks.flat(Infinity));
        assignableTasks = _.intersection(workableTasks, possibleTasks);
        if (assignableTasks.length == 0 ) { return ERR_INVALID_TARGET; }

        let assignableCreeps = idleCreeps.filter((c) => assignableTasks.some(el => _.has(c.validWorkableTasks, el)));
        if (assignableCreeps.length == 0) { return ERR_BUSY; }

        let assignableTargets = possibleTargets.filter((t) => assignableTasks.some(el => _.has(t.possibleNeededTasks, el)));
        if (assignableTargets.length == 0) { return ERR_INVALID_TARGET; }

        // Build a 3D matrix with x as creeps, y as targets, and z as tasks
        // This matrix as a priority in each cell, and we will find that cell, the xyz, and use that to assign tasks
        // this will also build a slightly seperate 2D matrix of the just the amount of work queued
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
                    if (!isNaN(tempPriority)) { priorityMatrix[x][y][z] = tempPriority; }
                }
            }
        }


        while (assignableCreeps.length > 0 && assignableTargets.length > 0) {
            let highestPriority = priorityMatrix.flat(Infinity).reduce((a, b) => { return a > b ? a : b; });
            if (highestPriority <= 0 ) { break; }
            let [x, y, z] = lib.getIndexPathOf(priorityMatrix, highestPriority);
            assignableCreeps[x].task = Task[assignableTasks[z]](assignableTargets[y]);
            assignableCreeps.splice(x, 1);
            priorityMatrix.splice(x, 1);
        }
    }
})