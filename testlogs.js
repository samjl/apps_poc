module.exports.getTestLogs = getTestLogs;

function getTestLogs(_db, socket, session, module) {
  // Start the DB change stream - get any new logs inserted
  testLogsLive(_db, socket, session, module);
  // Get any logs that have already been inserted to the DB
  retrieveTestLogParts(_db, socket, session, module);
}

function testLogsLive(_db, socket, session, module) {
  // Create pipeline
  console.log("Starting loglinks changestream");
  let pipeline = [
    {
      $match: {'fullDocument.sessionId': parseInt(session), 'fullDocument.moduleName': module}
    },
    {
      $project: {
        operationType: 1,
        updateDescription: 1,
        fullDocument: 1
      }
    }
  ];
  let changeStream = _db.collection('loglinks').watch(pipeline,
    {fullDocument: 'updateLookup'});
  changeStream.on('change', function(change) {
    if (change.operationType === 'update') {
      let keys = Object.keys(change.updateDescription.updatedFields);
      // shoudln't be a list of log messages but just in case
      let msg_oids = [];
      for(let i = 0, len = keys.length; i < len; i++) {
        if (keys[i] === 'logIds') {
          // { logIds: [ Oid ] }
          msg_oids.push(change.updateDescription.updatedFields[keys[i]][0]);
        } else {
          // { 'logIds.1': Oid }
          msg_oids.push(change.updateDescription.updatedFields[keys[i]]);
        }
        let match = {'_id': {'$in': msg_oids}};
        const logsPromise = _db.collection('testlogs').find(match).toArray();
        logsPromise
          .then(function testLogs(logs) {
            while (logs.length>0) {
              // Currently 500 message chunks gives the best client side performance
              // Just 1 message at a time here for updates
              socket.emit('saved messages', logs.splice(0, 500));
            }
          })
          .catch(function whenErr(err) {
            console.log('Error');
            console.log(err);
          });
      }
    }
  });
}

function retrieveTestLogParts(_db, socket, session, module) {
  // Get any existing logs (could be duplicates)
  let match = {'sessionId': parseInt(session), 'moduleName': module};
  const linksPromise = _db.collection('loglinks').find(match).toArray();
  linksPromise
    .then(function testLogLinks(links) {
      console.log('Found ' + links.length + ' loglink docs');
      let allLogLinks = [];
      for (let i = 0, len = links.length; i < len; i++) {
        console.log('Test: ' + links[i].testName + ' - Number of log links:' +
          ' ' + links[i].logIds.length);
        Array.prototype.push.apply(allLogLinks, links[i].logIds);
      }
      console.log('Total logs for module: ' + allLogLinks.length);
      match = {'_id': {'$in': allLogLinks}};
      // Now retrieve the logs from the list of _id's
      return _db.collection('testlogs').find(match).toArray();
    })
    .then(function testLogs(logs) {
      console.log('Number of log message docs retrieved: ' + logs.length);
      while (logs.length>0) {
        // Currently 500 message chunks gives the best client side performance
        socket.emit('saved messages', logs.splice(0, 500));
      }
      console.log('Done - all test logs emitted');
    })
    .catch(function whenErr(err) {
      console.log('Error');
      console.log(err);
    });

  let pipeline = [
    {"$match": match},
    {
      "$project": {
        moduleTests: 1, moduleFixtures: 1, "classes.className": 1,
        "classes.classTests": 1, "classes.classFixtures": 1
      }
    }
  ];
  let verifications = [];
  const aggPromise = _db.collection('modules').aggregate(pipeline).toArray();
  aggPromise
    .then(function module(items) {
      console.log('Aggregation outcome');
      console.log(items);
      // Array should always be length 1 when specifying session and module
      if (items.length !== 1) {
        console.log('Error: length of aggregation result is not 1 (' + items.length + ')');
      }
      // Collect all the Oids for tests and fixtures
      let testOids = [];  // Module and class test function results
      let fixtureOids = [];  // Module and class scoped fixtures
      testOids.push.apply(testOids, items[0].moduleTests);
      fixtureOids.push.apply(fixtureOids, items[0].moduleFixtures);
      for (let i = 0, len = items[0].classes.length; i < len; i++) {
        console.log(items[0].classes[i]);
        testOids.push.apply(testOids, items[0].classes[i].classTests);
        fixtureOids.push.apply(fixtureOids, items[0].classes[i].classFixtures);
      }
      console.log('Fixture OIds');
      console.log(fixtureOids);  // Still need to get the test scoped fixtures
      console.log('Test OIds');
      console.log(testOids);
      let matchTest = {'_id': {'$in': testOids}};
      let matchFix = {'_id': {'$in': fixtureOids}};
      return Promise.all([_db.collection('testresults').find(matchTest).toArray(),
                          _db.collection('fixtures').find(matchFix).toArray()])
    })
    .then(function testsAndHigherFixtures(items) {
      // *** [[module and class testresults], [module and class scoped
      // fixtures]] ***
      // TODO check for null - no results found
      console.log('Found tests (array)');
      console.log(items[0]);
      console.log('Found class and module fixtures (array)');
      console.log(items[1]);
      // All verifications - class and module scoped fixtures
      console.log('setup verifications (module and class):');
      for (let i = 0, len = items[1].length; i < len; i++) {
        verifications.push.apply(verifications, items[1][i].setupVerifications);
      }
      console.log('teardown verifications (module and class):');
      for (let i = 0, len = items[1].length; i < len; i++) {
        verifications.push.apply(verifications, items[1][i].teardownVerifications);
      }
      console.log('test call verifications:');
      for (let i = 0, len = items[0].length; i < len; i++) {
        verifications.push.apply(verifications, items[0][i].callVerifications);
      }
      let testFixturesOids = [];
      for (let i = 0, len = items[0].length; i < len; i++) {
        testFixturesOids.push.apply(testFixturesOids, items[0][i].functionFixtures);
      }
      console.log('Test Fixture OIds');
      console.log(testFixturesOids);
      let matchFix = {'_id': {'$in': testFixturesOids}};
      return _db.collection('fixtures').find(matchFix).toArray();
    })
    .then(function testFixtures(testsFixtures) {
      console.log('setup verifications (function):');
      for (let i = 0, len = testsFixtures.length; i < len; i++) {
        verifications.push.apply(verifications, testsFixtures[i].setupVerifications);
      }
      console.log('teardown verifications (function):');
      for (let i = 0, len = testsFixtures.length; i < len; i++) {
        verifications.push.apply(verifications, testsFixtures[i].teardownVerifications);
      }
      console.log(verifications.length);
      verifications.sort(function(a, b) {
        return a.timestamp - b.timestamp;
      });
      console.log('Sorted verification (all from module):');
      for (let i = 0, len = verifications.length; i < len; i++) {
        console.log(verifications[i].verifyMsg + ' ' + verifications[i].timestamp);
      }
      socket.emit('all verifications', verifications);
    })
    .catch(function whenErr(err) {
      console.log('Error');
      console.log(err);
    });
}