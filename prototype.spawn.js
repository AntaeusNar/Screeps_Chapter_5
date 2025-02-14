/** sorts the body parts before calling original spawnCreep function
 * @param {BodyPartConstant[]} body
 * @param {string} name
 * @param {SpawnOptions} [opts = {}]
 * @returns {ScreepsReturnCode}
 */
StructureSpawn.prototype.customSpawnCreep = function (body, name, opts = {}) {
    //sort the body parts
    const priority = [TOUGH, WORK, CARRY, ATTACK, RANGED_ATTACK, CLAIM, HEAL, MOVE];
    body.sort( (a,b) => priority.indexOf(a) - priority.indexOf(b));
    //call original function
    return this.spawnCreep(body, name, opts);
};