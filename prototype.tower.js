StructureTower.prototype.run =
  function () {
    let target;
    //Closest hostile healers

    target = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
      filter: h => h.getActiveBodyparts(HEAL) > 0 && h.pos.findInRange(FIND_HOSTILE_CREEPS, 3) > 0
    });

    //closest hostile attacker
    if (target == undefined) {
      target = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
        filter: h => h.getActiveBodyparts(ATTACK) > 0 || h.getActiveBodyparts(RANGED_ATTACK) > 0
      });
    }
    //closest hostiles
    if (target == undefined) {
      target = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    }
    if (target != undefined) {
      this.attack(target);
      return OK;
    }

    //closest healable creep
    target = this.pos.findClosestByRange(FIND_MY_CREEPS, {
      filter: c => c.hits < c.hitsMax
    });
    if (target != undefined) {
      this.heal(target);
      return OK;
    }
    return ERR_INVALID_TARGET;

  }