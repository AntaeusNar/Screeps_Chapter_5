// Expands creep-tasks v1.0.0: github.com/bencbartlett/creep-tasks
// && creeps-taskMaster with prototype changes
'use strict';

let Tasks = require('./lib.creepsTasks');

const ALL_TASKS = [
    'attack',
    'build',
    'claim',
    'dismantle',
    'drop',
    'fortify',
    'getBoosted',
    'getRenewed',
    'goTo',
    'goToRoom',
    'harvest',
    'heal',
    'meleeAttack',
    'pickup',
    'rangedAttack',
    'repair',
    'reserve',
    'signController',
    'transfer',
    'upgrade',
    'withdraw'
];

const MOVE_TASKS = [
    ['getBoosted', {workCanDo: 1, workSpeed: 1}],
    ['getRenewed', {workCanDo: 1, workSpeed: 1}],
    ['goTo', {workCanDo: 1, workSpeed: 1}],
    ['goToRoom', {workCanDo: 1, workSpeed: 1}],
    ['signController', {workCanDo: 1, workSpeed: 1}]
];
const FIND_TASK_TARGETS = [FIND_CREEPS, FIND_STRUCTURES, FIND_SOURCES, FIND_DROPPED_RESOURCES, FIND_RUINS, FIND_TOMBSTONES, FIND_MY_CONSTRUCTION_SITES]

// RoomObject prototypes ========================================================================================================

/** Gets how much work for a task type is queued up in assigned tasks
 * @param {String} taskName - the task we are filtering for
 * @returns {number} queued up work
 */
RoomObject.prototype.queuedWork = function(taskName) {
    if (!this._queuedWorkCache) {
        this._queuedWorkCache = {};
    };
    if (!this._queuedWorkCache[taskName]) {
        this._queuedWorkCache[taskName] = _.sum(this.targetedBy, function(c) {
            if (c.validWorkableTasks && c.validWorkableTasks[taskName]) {
                return c.validWorkableTasks[taskName].workCanDo || 0;
            } else {
                return 0;
            };
        });
    };
    return this._queuedWorkCache[taskName];
};

// Room prototypes ==============================================================================================================

/** Add a target lookup to rooms
 * @param {number|number[]} findTypes=FIND_TASK_TARGETS - one of or an array of the FIND_* constants
 * @returns {Object} {Targets: {RoomObject[]}, Tasks: string[]}
*/
Room.prototype.lookupTargetTasks = function(findTypes=FIND_TASK_TARGETS) {
    if (!this._lookupTargetTasks) {
        this._lookupTargetTasks = {};
        let possibleTargets = [];
        if (Array.isArray(findTypes)) {
            for (let i = 0; i < findTypes.length; i++) {
                possibleTargets.push(...this.find(findTypes[i], {
                    filter: function(obj) {
                        // only keep obj that have tasks
                        return obj.possibleNeededTasks && Object.keys(obj.possibleNeededTasks).length > 0;
                    }
                }));
            }
        } else {
            possibleTargets.push(...this.find(findTypes, {
                filter: function(obj) {
                    // only keep obj that have tasks
                    return obj.possibleNeededTasks && Object.keys(obj.possibleNeededTasks).length > 0;
                }
            }));
        }
        let possibleNeededTasks = [];
        possibleTargets.forEach((t) => possibleNeededTasks.push(_.keysIn(t.possibleNeededTasks)));
        possibleNeededTasks = _.uniq(possibleNeededTasks);
        this._lookupTargetTasks = {Targets: possibleTargets, Tasks: possibleNeededTasks};
    }
    //Console logging to see what targets are found
    //console.log("Room " + this.name + " found " + this._lookupTargetTasks.Targets.length + " targets.");
    //let targetIDs = [];
    //this._lookupTargetTasks.Targets.forEach((t) => targetIDs.push(t.id));
    //console.log(targetIDs);
    return this._lookupTargetTasks
};

// Creep prototypes =============================================================================================================

/** find and cache the current move speed on plains of a creep
 * // DOC: need to get the JSdoc stuff working here
*/
Object.defineProperty(Creep.prototype, 'moveSpeed', {
    get: function () {
        if (!this._moveSpeed) {
            let moveParts = this.getActiveBodyparts(MOVE);
            let carryParts = this.getActiveBodyparts(CARRY);
            let heavyCaryParts = 0;
            let allParts = this.body.length;
            if (carryParts) {
                heavyCaryParts = Math.ceil(this.store.getUsedCapacity()/50);
            }
            let heavyParts = allParts-moveParts-carryParts+heavyCaryParts;
            this._moveSpeed = Math.ceil(heavyParts/moveParts);
        }
        return this._moveSpeed
    }
});

/** Returns the total cost of the creep
 * //DOC: need to get the JSdoc stuff working here
 */
Object.defineProperty(Creep.prototype, 'cost', {
    get: function() {
        if (!this._cost) {
            if (!this.memory.cost) {
                this.memory.cost = _.sum(this.body.map((b) => BODYPART_COST[b.type]));
            }
            this._cost = this.memory.cost;
        }
        return this._cost;
    }
});

/** Valid tasks the creep can do based on creep's state (active parts and store)
 * // DOC: need to get the JSdoc stuff working here
 * // TODO: allow for other RESOURCE_TYPES
 * @member {string[]} validWorkableTasks
 * @readonly
 */
Object.defineProperty(Creep.prototype, 'validWorkableTasks', {
    get: function () {
        if (!this._validWorkableTasks) {
            this._validWorkableTasks = {};
            if (!this.spawning) {
                let moveParts = this.getActiveBodyparts(MOVE);
                let workParts = this.getActiveBodyparts(WORK);
                let carryParts = this.getActiveBodyparts(CARRY);
                let attackParts = this.getActiveBodyparts(ATTACK);
                let rangedAttackParts = this.getActiveBodyparts(RANGED_ATTACK);
                let healParts = this.getActiveBodyparts(HEAL);
                let claimParts = this.getActiveBodyparts(CLAIM);
                if (moveParts) {
                    // General Move tasks
                    for (let i = 0; i < MOVE_TASKS.length; i++) {
                        this._validWorkableTasks[MOVE_TASKS[i][0]] = MOVE_TASKS[i][1];
                    }

                    if (workParts && !carryParts) {
                        // MOVE and WORK tasks but NOT carry
                        this._validWorkableTasks['harvest'] = {workCanDo: workParts, workSpeed: workParts};
                        this._validWorkableTasks['dismantle'] = {workCanDo: this.ticksToLive*workParts*50, workSpeed: workParts*50};
                    }

                    if (carryParts) {
                        // MOVE, and CARRY
                        if (this.store.getUsedCapacity(RESOURCE_ENERGY)) {
                            // MOVE, CARRY, and RESOURCE_ENERGY
                            this._validWorkableTasks['drop'] = {workCanDo: this.store.getUsedCapacity(RESOURCE_ENERGY), workSpeed: this.store.getUsedCapacity(RESOURCE_ENERGY)};
                            this._validWorkableTasks['transfer'] = {workCanDo: this.store.getUsedCapacity(RESOURCE_ENERGY), workSpeed: this.store.getUsedCapacity(RESOURCE_ENERGY)};
                            if (workParts) {
                                // MOVE, CARRY, RESOURCE_ENERGY, and WORK
                                this._validWorkableTasks['build'] = {workCanDo: this.store.getUsedCapacity(RESOURCE_ENERGY), workSpeed: workParts*5};
                                this._validWorkableTasks['repair'] = {workCanDo: this.store.getUsedCapacity(RESOURCE_ENERGY)*100, workSpeed: workParts*100};
                                this._validWorkableTasks['upgrade'] = {workCanDo: this.store.getUsedCapacity(RESOURCE_ENERGY), workSpeed: workParts}
                            }
                        }

                        if (this.store.getFreeCapacity(RESOURCE_ENERGY)) {
                            // MOVE, CARRY, and Free Space
                            this._validWorkableTasks['pickup'] = {workCanDo: this.store.getFreeCapacity(RESOURCE_ENERGY), workSpeed: this.store.getFreeCapacity(RESOURCE_ENERGY)};
                            this._validWorkableTasks['withdraw'] = {workCanDo: this.store.getFreeCapacity(RESOURCE_ENERGY), workSpeed: this.store.getFreeCapacity(RESOURCE_ENERGY)};
                            if (workParts) {
                                // MOVE, CARRY, Free Space, and WORK; rewrite the harvest and dismantle
                                this._validWorkableTasks['harvest'] = {workCanDo: workParts, workSpeed: workParts};
                                this._validWorkableTasks['dismantle'] = {workCanDo: this.store.getFreeCapacity(RESOURCE_ENERGY)/.25*50, workSpeed: workParts*50};
                            }
                        }
                    }

                    if (attackParts) {
                        // Melee Attack
                        this._validWorkableTasks['meleeAttack'] = {workCanDo: this.ticksToLive*attackParts*30, workSpeed: attackParts*30};
                    }
                    if (rangedAttackParts) {
                        // Ranged Attack
                        this._validWorkableTasks['rangedAttack'] = {workCanDo: this.ticksToLive*rangedAttackParts*10, workSpeed: rangedAttackParts*10};
                    }
                    if (healParts) {
                        // HEAL
                        this._validWorkableTasks['heal'] = {workCanDo: this.ticksToLive*healParts*4, workSpeed: healParts*4}
                    }
                    if (claimParts) {
                        this._validWorkableTasks['reserve'] = {workCanDo: this.ticksToLive*claimParts, workSpeed: claimParts};
                        this._validWorkableTasks['claim'] = {workCanDo: 1, workSpeed: 1};
                    }
                }
            }
        }
        return this._validWorkableTasks;
    }
});

/** Possible tasks a target could have done to it based on the target's state
 * // DOC: need to get the JSdoc stuff working here
 * // TODO: allow for other RESOURCE_TYPES
 */
Object.defineProperty(Creep.prototype, 'possibleNeededTasks', {
    get: function () {
        if (!this._possibleNeededTasks) {
            this._possibleNeededTasks = {};
            if (!this.spawning) {
                // Only worry about the creep if it is not spawning
                if (this.my) {
                    // My Creep
                    if (this.hits < this.hitsMax) {
                        //MY and needs healed
                        this._possibleNeededTasks['heal'] = {workRequired: this.hitsMax-this.hits};
                    };

                    /** //FIXME: This section is working for selection, but creeps are keeping the tasks even when not needed
                     * will need to expand the isValidTarget section of each task or come up with some clever recheck
                     * Turned off

                    if (!this.isIdle && this.memory.task && this.memory.task.name) {
                        //MY, has a task assigned
                        if (this.memory.task.name == 'harvest' && this.store && this.store.getUsedCapacity(RESOURCE_ENERGY)) {
                            //MY, task is harvesting, and has energy; can take it
                            this._possibleNeededTasks['withdraw'] = {workRequired: this.store.getUsedCapacity(RESOURCE_ENERGY)};
                        }

                        if ((this.memory.task.name == 'upgrade' | this.memory.task.name == 'build' | this.memory.task.name == 'repair') && this.store && this.store.getFreeCapacity(RESOURCE_ENERGY)) {
                            // MY, task is building|upgrading|repairing, and needs energy; fill it
                            this._possibleNeededTasks['transfer'] = {workRequired: this.store.getFreeCapacity(RESOURCE_ENERGY)};
                        }
                    }
                    */


                } else {
                    // Not My creep; needs dehealed for sure
                    this._possibleNeededTasks['meleeAttack'] = {workRequired: this.hits};
                    this._possibleNeededTasks['rangedAttack'] = {workRequired: this.hits};
                };
            };
        };
        return this._possibleNeededTasks;
    }
});

// Structure prototypes =========================================================================================================

/** Possible tasks a target could have done to it based on the target's state
 * // DOC: need to get the JSdoc stuff working here
 */
Object.defineProperty(Structure.prototype, 'possibleNeededTasks', {
    get: function() {
        if (!this._possibleNeededTasks) {
            this._possibleNeededTasks = {};

            switch(this.structureType) {
                case STRUCTURE_WALL:
                case STRUCTURE_RAMPART:
                    if (this.room.controller.my) {
                        if (this.hits < 400000/8*this.room.controller.level && this.hitsMax > 0) {
                            // try to keep my walls at or above 50,000 per controller level
                            this._possibleNeededTasks['repair'] = {workRequired: 400000/8*this.room.controller.level-this.hits - this.queuedWork('repair')};
                        };
                    };
                    break;
                case STRUCTURE_ROAD:
                    // keep roads to at least 2,000 ticks of life left
                    if (this.hits < this.hitsMax/25) {
                        this._possibleNeededTasks['repair'] = {workRequired: this.hitsMax-this.hits - this.queuedWork('repair')};
                    };
                    break;
                case STRUCTURE_CONTROLLER:
                    if (this.my) {
                        // upgrade the controller
                        // if the controller is downgraded the progress Total will smaller then the progress
                        if ( this.progressTotal > this.progress) {
                            this._possibleNeededTasks['upgrade'] = {workRequired: this.progressTotal - this.progress};
                        } else {
                            this._possibleNeededTasks['upgrade'] = {workRequired: this.progress - this.progressTotal};
                        }
                    } else if (this.reservation == undefined | (this.reservation.username == MY_NAME && this.reservation.ticksToEnd < 5000)) {
                        this._possibleNeededTasks['reserve'] = {workRequired: 5000-this.reservation.ticksToEnd};
                    }
                case STRUCTURE_CONTAINER:
                    if (this.hits < 100000) {
                        //if it is at less then 100k hit (250k max); repair
                        this._possibleNeededTasks['repair'] = {workRequired: this.hitsMax-this.hits - this.queuedWork('repair')};
                    };
                default:
                    if (this.my) {
                        if (this.hits < this.hitsMax) {
                            // keep all of my other structures repaired
                            this._possibleNeededTasks['repair'] = {workRequired: this.hitsMax-this.hits - this.queuedWork('repair')};
                        };
                        if (this.store != undefined && this.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                            // if it is mine and has room, fill it
                            this._possibleNeededTasks['transfer'] = {workRequired: this.store.getFreeCapacity(RESOURCE_ENERGY) - this.queuedWork('transfer')};
                        };
                    } else {
                        if (this.store != undefined && this.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                            // if it has a store with stuff we want to take it (containers, abandoned buildings)
                            this._possibleNeededTasks['withdraw'] = {workRequired: this.store.getUsedCapacity(RESOURCE_ENERGY) - this.queuedWork('withdraw')};
                        };
                    }
            }
        }

        return this._possibleNeededTasks;
    }
});

// Source prototypes ============================================================================================================

/** Possible tasks a target could have done to it based on the target's state
 * // DOC: need to get the JSdoc stuff working here
 */
// Sources
Object.defineProperty(Source.prototype, 'possibleNeededTasks', {
    get: function () {
        if (!this._possibleNeededTasks) {
            this._possibleNeededTasks = {};
            if (this.energy && this.pos.availableNeighbors().length > this.targetedBy.length) {
                // Limit to the number of availableNeighbors
                // Do some math the allow the source to figure
                let maxWorkParts = Math.ceil(this.energyCapacity/300/2);
                let currentlyTargeting = this.targetedBy;
                let currentWorkParts = _.sum(currentlyTargeting, function(c) { return c.getActiveBodyparts(WORK);});
                let neededWorkParts = Math.max(maxWorkParts-currentWorkParts, 0)
                // Limit the workRequired for this to the number of availableNeighbors, AND energyCapacity/300/2
                // if it has some RESOURCE_ENERGy and there are open slots; harvest
                if (neededWorkParts > 0) {
                    this._possibleNeededTasks['harvest'] = {workRequired: neededWorkParts};
                }
            }
        }
        return this._possibleNeededTasks;
    }
});

// Other prototypes =============================================================================================================


// Construction Sites
/** Possible tasks a target could have done to it based on the target's state
 * // DOC: need to get the JSdoc stuff working here
 */
Object.defineProperty(ConstructionSite.prototype, 'possibleNeededTasks', {
    get: function () {
        if (!this._possibleNeededTasks) {
            this._possibleNeededTasks = {};
            if (this.my) {
                this._possibleNeededTasks['build'] = {workRequired: this.progressTotal - this.progress - this.queuedWork('build')};
            }
        }
        return this._possibleNeededTasks;
    }
});

// Resources
/** Possible tasks a target could have done to it based on the target's state
 * // DOC: need to get the JSdoc stuff working here
 */
Object.defineProperty(Resource.prototype, 'possibleNeededTasks', {
    get: function () {
        if (!this._possibleNeededTasks) {
            this._possibleNeededTasks = {};
            if (this.resourceType == RESOURCE_ENERGY) {
                // pickup that sweet RESOURCE_ENERGy
                this._possibleNeededTasks['pickup'] = {workRequired: this.amount - this.queuedWork('pickup')};
            }
        }
        return this._possibleNeededTasks;
    }
});

// Tombstones
/** Possible tasks a target could have done to it based on the target's state
 * // DOC: need to get the JSdoc stuff working here
 */
Object.defineProperty(Tombstone.prototype, 'possibleNeededTasks', {
    get: function () {
        if (!this._possibleNeededTasks) {
            this._possibleNeededTasks = {};
            if (this.store != undefined && this.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                // grab that sweet RESOURCE_ENERGy
                this._possibleNeededTasks['withdraw'] = {workRequired: this.store.getUsedCapacity(RESOURCE_ENERGY) - this.queuedWork('withdraw')};
            }
        }
        return this._possibleNeededTasks;
    }
});

// Ruins
/** Possible tasks a target could have done to it based on the target's state
 * // DOC: need to get the JSdoc stuff working here
 */
Object.defineProperty(Ruin.prototype, 'possibleNeededTasks', {
    get: function () {
        if (!this._possibleNeededTasks) {
            this._possibleNeededTasks = {};
            if (this.store != undefined && this.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
                // if it has some RESOURCE_ENERGy; withdraw
                this._possibleNeededTasks['withdraw'] = {workRequired: this.store.getUsedCapacity(RESOURCE_ENERGY) - this.queuedWork('withdraw')};

            }
        }
        return this._possibleNeededTasks;
    }
});