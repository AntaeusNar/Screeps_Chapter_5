// Expands creep-tasks v1.0.0: github.com/bencbartlett/creep-tasks
// && creeps-tasks-prototypes with prioritization logic
'use strict';

/** Required Files */
const Task = require('./lib.creepsTasks');
require('./lib.creepsTasksPrototypes');
const lib = require("./lib");

/** JSDOC Type Definitions */

/** TaskType
 * @typedef {string} TaskType
 */


/** Calculates the priority of a creep/target/task grouping.
 * Higher priority = More change in target, faster, lower cost
 * @param {RoomObject} target - the target
 * @param {Creep} creep - the creep
 * @param {TaskType} task - the task
 * @param {number} [workQueued=0] - how much work has already been queued
 * @return {number} the calculated priority
 */
function _calcPriority(target, creep, task, workQueued=0) {
  // some sanity checks
  if (typeof target !== "object" || typeof creep !== 'object' || typeof task !== 'string') {
    console.log('_calcPriority was fed the wrong kinds of things.');
    return;
  }
  // If the creep cannot do the task, set priority to -18
  if (creep.validWorkableTasks[task] == undefined) {
    //console.log(JSON.stringify(creep.validWorkableTasks));
    return -18;
  }
  // If the target does not need the work done, set priority to -17
  if (!target.possibleNeededTasks[task] || target.possibleNeededTasks[task].workRequired - workQueued <= 0) {
    return -17;
  }
  let maxWork = Math.min(target.possibleNeededTasks[task].workRequired - workQueued, creep.validWorkableTasks[task].workCanDo);

  // TODO: This SHOULD allow for multiroom implementation
  let distance = target.wpos.getRangeTo(creep.wpos);
  //let distance = target.pos.getRangeTo(creep.pos);

  let workSpeed = maxWork/creep.validWorkableTasks[task].workSpeed;
  let ticksToWork = distance/creep.moveSpeed + workSpeed;
  // If the creep will die before completing the work, set priority to -19
  if (distance/creep.moveSpeed > creep.ticksToLive) {
      return -19;
  }
  // if the creep is a perfect match of EstWorkRemaining and workRequired, add a bonus
  let matchBonus = 0;
  if (creep.validWorkableTasks[task].workCanDo == target.possibleNeededTasks[task].workRequired - workQueued) {
      matchBonus = 1000000;
  }
  let percentCompletion = Math.min(100, Math.ceil(maxWork/(target.possibleNeededTasks[task].workRequired - workQueued)*100));
  let result = Math.ceil(percentCompletion/ticksToWork/creep.cost*1000000) + matchBonus;

  return result;
}

let taskMaster = {
    /** Given idleCreeps, prioritizes and assigns tasks
     * @param {Creep[]} [idleCreeps] - array of idle creeps
     * @param {string[]} [roomNames] - array of rooms names
     */
    masterTasks: function(idleCreeps, roomNames) {
        let startCPU = Game.cpu.getUsed();

        // if not give idle creeps, find some
        if (!idleCreeps) {
            idleCreeps = _.filter(_.values(Game.creeps), creep => creep.isIdle && !creep.spawning);
        }
        if (idleCreeps.length == 0) {
            console.log("INFO: TaskMaster has no idle creeps to try to give tasks to.");
            return ERR_INVALID_TARGET;
        }

        // get the unique valid tasks the idle creeps can do
        let validWorkableTasks = [];
        idleCreeps.forEach((c) => validWorkableTasks.push(_.keysIn(c.validWorkableTasks)));
        validWorkableTasks = _.uniq(validWorkableTasks.flat(Infinity));
        if (validWorkableTasks.length == 0) {
            console.log("ERROR: TaskMaster found " + idleCreeps.length + " creeps but no valid tasks.");
            return ERR_INVALID_TARGET;
        }

        //Check all rooms for Targets and Tasks, using provided rooms if given
        let roomResults = [];
        if (!roomNames) {
            for (let roomName in Game.rooms) {
                let room = Game.rooms[roomName];
                roomResults.push(room.lookupTargetTasks());
            }
        } else {
            for (let roomName of roomNames) {
                let room = Game.rooms[roomName];
                roomResults.push(room.lookupTargetTasks());
            }
        }
        if (roomResults.length == 0) {
            // TODO add a scouting task function here
            console.log("INFO: TaskMaster checked rooms, but found no Targets needing tasks.");
            return ERR_INVALID_TARGET;
        }

        // Collect all Targets and tasks rooms have
        let possibleTasks = [];
        let assignableTargets = [];
        roomResults.forEach((r) => {
            possibleTasks.push(...r.Tasks);
            assignableTargets.push(...r.Targets);
        });
        if (assignableTargets.length == 0 && possibleTasks != 0) {
            console.log("ERROR: TaskMaster found possible tasks, but no targets!!!");
            return ERR_INVALID_TARGET;
        }

        // Only uniq possible tasks
        possibleTasks = _.uniq(possibleTasks.flat(Infinity));
        if (possibleTasks.length == 0) {
            console.log("ERROR: TaskMaster found " + roomResults.length + " rooms with targets, but no tasks.");
            return ERR_INVALID_TARGET;
        }

        // Reduce assignable tasks to tasks that are both possible and valid
        let assignableTasks = _.intersection(validWorkableTasks, possibleTasks);
        if (assignableTasks.length == 0) {
            console.log("INFO: TaskMaster was unable to find any Assignable tasks between " + validWorkableTasks + " and " + possibleTasks);
            return ERR_INVALID_TARGET;
        };

        // Filter creeps to only those with overlapping assignable and valid tasks
        let assignableCreeps = idleCreeps.filter((c) => assignableTasks.some(el => _.has(c.validWorkableTasks, el)));
        if (assignableCreeps.length == 0) {
            console.log("ERROR: TaskMaster expected to find assignable Creeps, but found none.");
            return ERR_INVALID_TARGET;
        };

        // Filter targets to only those with overlapping assignable and possible tasks
        assignableTargets = assignableTargets.filter((t) => assignableTasks.some(el => _.has(t.possibleNeededTasks, el)));
        if (assignableTargets.length == 0) {
            console.log("ERROR: TaskMaster expected to find assignable Targets, but found none.");
            return ERR_INVALID_TARGET;
        };

        // Build a 2D workQueuedMatrix where y = target, z = task
        let workQueuedMatrix = [];
        for (let y = 0; y < assignableTargets.length; y++) {
            workQueuedMatrix[y] = [];
            for (let z = 0; z < assignableTasks.length; z++) {
                workQueuedMatrix[y][z] = 0;
            };
        };

        // Build a 3D priorityMatrix where x = creep, y = target, z = task
        let priorityMatrix = [];
        for (let x = 0; x < assignableCreeps.length; x++) {
            priorityMatrix[x] = [];
            for (let y = 0; y < assignableTargets.length; y++) {
                priorityMatrix[x][y] = [];
                for (let z = 0; z < assignableTasks.length; z++) {
                    let tempPriority = _calcPriority(assignableTargets[y], assignableCreeps[x], assignableTasks[z], workQueuedMatrix[y][z]);
                    if (!lib.isNumeric(tempPriority)) {
                        console.log("ERROR: TaskMaster tried to calculate a priority but got " + tempPriority);
                    } else {
                        priorityMatrix[x][y][z] = tempPriority;
                    };
                };
            };
        };

        // Cycle through all creeps until all creeps have a task or there is nothing to do
        let dropOut = false;
        let successCount = 0;
        let oCreepCount = assignableCreeps.length;
        let oTargetCount = assignableTargets.length;
        let oTaskCount = assignableTasks.length;
        let assignedTasks = [];
        while (!dropOut && assignableCreeps.length > 0 && assignableTargets.length > 0) {
            // get highest priority
            let highestPriority = priorityMatrix.flat(Infinity).reduce((a,b) => {return a > b ? a : b});
            if (highestPriority <=0) {
                dropOut = true;
            } else {
                // find out which creep/target/task pair had the hightest priority
                let [x, y, z] = lib.getIndexPathOf(priorityMatrix, highestPriority);

                let creep = assignableCreeps[x];
                let target = assignableTargets[y];
                let task = assignableTasks[z];
                // assign the creep/target/task pairing
                // TODO: overlay a visual indication of path to target when assigning
                creep.task = Task[task](target);
                creep.say(task);
                // update the workQueuedMatrix
                workQueuedMatrix[y][z] = workQueuedMatrix[y][z] + creep.validWorkableTasks[task].workCanDo;
                // remove the creep from both the priorityMatrix and the assignableCreeps
                assignableCreeps.splice(x, 1);
                priorityMatrix.splice(x, 1);
                // update the priorityMatrix to account for the queued work
                for (let a = 0; a < assignableCreeps.length; a++) {
                    let tempPriority = _calcPriority(assignableTargets[y], assignableCreeps[a], assignableTasks[z], workQueuedMatrix[y][z])
                    if (!lib.isNumeric(tempPriority)) {
                        console.log("ERROR: TaskMaster tried to calculate a priority but got " + tempPriority);
                    } else {
                        priorityMatrix[a][y][z] = tempPriority;
                    }
                };
                // increment successCount and add task to assignedTasks
                successCount++;
                assignedTasks.push(task);
            };
        };
        assignedTasks = _.uniq(assignedTasks);
        let usedCPU = Game.cpu.getUsed() - startCPU;
        let statusMessage = "INFO: TaskMaster used " + usedCPU + " CPU to assign " +
            successCount + " tasks across a total of " + oCreepCount + " creeps and " +
            oTargetCount + " targets from " + oTaskCount + " total actionable tasks.";
        console.log(statusMessage);
        console.log("INFO: The Assigned tasks where: " + assignedTasks);
        if (dropOut) {
            console.log("INFO: TaskMaster did run out of possible assignments.")
        };
        return OK;
    },
};

module.exports = taskMaster;