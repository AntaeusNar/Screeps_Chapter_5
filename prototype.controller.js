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
                // TODO: filter this down to not include neutral or other owner rooms
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
    }
})