module.exports = (function () { // store and reuse often used paths

    function addPath(from, to, path) {
        var key = getPathKey(from, to);
        var cache = Memory.pathCache || {};
        var cachedPath = {
          path: path,
          uses: 1
        }
        cache[key] = cachedPath;
        Memory.pathCache = cache;
    }

    function getPath(from, to) {
        var cache = Memory.pathCache;
        if(cache) {
          var cachedPath = cache[getPathKey(from, to)];
          if(cachedPath) {
            cachedPath.uses += 1;
            Memory.pathCache = cache;
            return cachedPath;
          }
        }
    }

    function cleanCache() {
        //cleanCacheByUsage(1);
    }

    function cleanCacheByUsage(usage) {
        if(Memory.pathCache && _.size(Memory.pathCache) > 1500) { //1500 entries ~= 100kB
          console.log('Cleaning path cache (usage == '+usage+')...');
          var counter = 0;
          for (var key in Memory.pathCache) {
            var cached = Memory.pathCache[key];
            if(cached.uses === usage) {
              Memory.pathCache[key] = undefined;
              counter += 1;
            }
          }
          Game.notify('Path cache of usage '+usage+' cleaned! '+counter+' paths removed', 6 * 60);
          cleanCacheByUsage(usage + 1);
        }
    }

  // require('pathCache').showCacheUsage();
  function showCacheUsage() {
    var usageCountCounter = {};
    var howManyTimesCacheUsed = 0;
    for (var key in Memory.pathCache) {
      var cached = Memory.pathCache[key];
      usageCountCounter['used'+cached.uses] = usageCountCounter['used'+cached.uses] + 1 || 1;
      howManyTimesCacheUsed += cached.uses;
    }

    console.log(JSON.stringify(usageCountCounter));
    console.log('howManyTimesCacheUsed: ' + howManyTimesCacheUsed);
    console.log('cache size: ' + _.size(Memory.pathCache));
  }

  function getPathKey(from, to) {
    //console.log("getPathKey= "+getPosKey(from) + '$' + getPosKey(to));
    return getPosKey(from) + '$' + getPosKey(to);
  }

  function getPosKey(pos) {
    return pos.x + 'x' + pos.y + pos.roomName;
  }

  return {
    add: addPath,
    get: getPath,
    clean: cleanCache,
    showCacheUsage: showCacheUsage
  }
}());