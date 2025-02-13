  /** Given a roomName and a maxDistance from roomName, generates a array of room names within the maxDistance
      * @param {string} roomName
      * @param {number} maxDistance
      * @param {boolean} [countSK = false]
      * @param {boolean} [countHighway = false]
      * @returns {array} array of roomNames
      */
  roomMapper: function(roomName, maxDistance, countSK = false, countHighway = false) {
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
}// end of roomMapper

module.exports = roomMapper;