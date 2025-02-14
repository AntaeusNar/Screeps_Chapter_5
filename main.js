/** Screeps Chapter 5 */

require('./lib.lib');
require('./prototype.controller');

/** Configuration Options */
const MY_NAME = 'AntaeusNar';
const percentCPUtargeted = .5; //targeted usual CPU usage
const availableCPUperTick = 20; //number of cpu new cpu we get per tick
const CPUhistory = 30; //length of time to keep cpu data

/** Global Restart Event Handling Logic */
console.log('<<<< Global Restart Event >>>>');
if (Memory.CpuData == undefined) {
    Memory.CpuData = [];
}

/** Main Exported Function Loop */
module.exports.loop = function() {
    /** Start of CPU tracking */
    let startCPU = Game.cpu.getUsed();

    _memoryClean();

    /** Calculate the target number of creeps based on CPU usage */
    let sum = Memory.CpuData.reduce((partialSum, a) => partialSum + a, 0);
    let rollingAvg = Math.max(1, Math.floor((sum/CPUhistory)*100))/100;
    let targetNumberOfCreeps = Math.max(1, Math.floor((availableCPUperTick*percentCPUtargeted)/rollingAvg));

    // collect all of our owned controllers
    let controllers = _.filter(_.values(Game.structures), s => s.my && s.structureType == STRUCTURE_CONTROLLER);
    for (let controller of controllers) {
        controller.run();
    }


    /** End of loop CPU tracking update */
    let endCPU = Game.cpu.getUsed();
    let usedCPU = Math.ceil((endCPU - startCPU) * 1000)/1000
    let length = Memory.CpuData.push(usedCPU/Object.keys(Game.creeps).length); //Total used cpu per creep
    if (length > CPUhistory) {
        Memory.CpuData.shift();
    }
    console.log('INFO: Used CPU: ' + usedCPU + " Moving Average: " + rollingAvg + " Target # Creeps: " + targetNumberOfCreeps);
    _pixelSale();
}

/** Memory Clean */
function _memoryClean() {
    for (let name in Memory.creeps) {
        if (!Game.creeps[name]) {
            delete Memory.creeps[name];
            console.log('Info: Cleaning non-existing creep memory: ', name);
        }
    }
}

/** Pixel Sale */
function _pixelSale() {
    if (Game.cpu.bucket == 10000) {
        Game.cpu.generatePixel();
        console.log('INFO: Got a New Pixel.');
    }
}