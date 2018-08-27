$(window).ready(function() {
  let sessionId = localStorage.getItem("sessionId");
  // null if not stored - server gets ID for NEXT (not started) session
  console.log("Session page with saved ID " + sessionId);
  $('#sessionId').val(sessionId);

  // let socket = io.connect('', {query: 'page=session'});
  let socket = io();
  socket.on('connect', function () {
    console.log("Session Client connected");
    socket.emit('from', {
      page: 'session',
      sessionId: sessionId
    });
  });

  // Initial insert - currently populated fields:
  // sessionId, collected, status
  socket.on('session_insert', (data) => {
    console.log("Initial session insert received");
    console.log(data);
    console.log('Collected tests: ' + data.collected);
    console.log('Collected tests #: ' + data.collected.length);
    $('#sessionRx').text(data.sessionId);
    $('#sessionCollected').text(data.collected.length);
    // $('#plan').text('Test plan: ' + data.plan);
    $('#status').text(data.status);
  });

  // Existing session or session in-progress
  socket.on('session_full', (data) => {
    console.log("Completed session received");
    console.log(data);
    console.log('Collected tests: ' + data.collected);
    console.log('Collected tests #: ' + data.collected.length);
    $('#sessionRx').text(data.sessionId);
    $('#sessionCollected').text(data.collected.length);
    // $('#plan').text('Test plan: ' + data.plan);
    $('#status').text(data.status);

    // Process (data.)runOrder
    Object.entries(data.runOrder).forEach(function(k) {
      let runOrderIndex = k[0];
      let fontWeight = 'normal';

      // TODO just update module, class and test for the final array item
      $('#module').text(k[1].moduleName);
      $('#class').text(k[1].className);
      $('#test').text(k[1].testName);

      // TODO check if the ID already exists (required for server restarts?)
      if (k[1].status === 'complete') {
        fontWeight = 'bold';
      }
      $('<li>', {
        id: 'test_' + runOrderIndex
      }).append([
        $('<p>', {
          id: "name_" + runOrderIndex,
          text: k[1].testName
        }).css({
          display: "inline"
        }),
        $('<p>', {
          id: "outcome_" + runOrderIndex,
          text: ":  " + k[1].outcome
        }).css({
          display: "inline",
          fontWeight: fontWeight
        })
      ]).appendTo($('#testsList'));
    });

    // Progress (TODO if session is still in progress)
    if (data.hasOwnProperty('progress')) {
      console.log(data.progress);
      $('#phase').text(data.progress.phase);
      $('#activeSetups').text(data.progress.activeSetups);
      let comp = data.progress.completed;
      $('#complete').append('<p>' + comp.moduleName + ' :: ' + comp.className +
        ' :: ' + comp.testName + ' :: ' +  comp.fixtureName + ' :: ' +
        comp.phase + ' :: ' + comp.outcome + ' :: ' + comp.verifications +
        '</p>');

      // Scroll to bottom
      let scrollH = $('#complete').prop('scrollHeight');
      console.log("Scroll height: " + scrollH);
      $('#complete').scrollTop(scrollH);
    }
  });

  socket.on('session_update', (data) => {
    console.log(data);
    if (data.hasOwnProperty('updatedFields')) {
      // TODO process this at the server end instead - just for array elements like runOrder
      Object.entries(data.updatedFields).forEach(function(k) {
        if (k[0].indexOf('runOrder') === 0) {
          // attribute starts with runOrder
          console.log(k);
          console.log("Found - " + k[0]);

          let re = /runOrder\.?(\d*)\.?(\w*)/gm;
          let my = re.exec(k[0]);
          console.log(my);
          let runOrderIndex = my[1];
          let runOrderParam = my[2];

          if (!runOrderIndex) {
            console.log('runOrder with no index detected - element 0');
            $('#module').text(k[1][0].moduleName);
            $('#class').text(k[1][0].className);
            $('#test').text(k[1][0].testName);
            runOrderIndex = 0;
            $('<li>', {
              id: 'test_' + runOrderIndex
            }).append([
              $('<p>', {
                id: "name_" + runOrderIndex,
                text: k[1][0].testName
              }).css({
                display: "inline"
              }),
              $('<p>', {
                id: "outcome_" + runOrderIndex,
                text: ":  " + k[1][0].outcome
              }).css({
                display: "inline"
              })
            ]).appendTo($('#testsList'));
          } else if (runOrderParam) { // TODO param update to first test?
            console.log('runOrder ' + runOrderIndex + ' param update - ' +
              runOrderParam + ': ' + k[1]);
            if (runOrderParam === "status" && k[1] === "complete") {
              $('#outcome_' + runOrderIndex).css('font-weight', 'bold');
            } else {
              $('#' + runOrderParam + "_" + runOrderIndex).text(':  ' +
                k[1]);
            }
          } else {
            console.log('runOrder full update/insert for index ' +
              runOrderIndex);

            $('#module').text(k[1].moduleName);
            $('#class').text(k[1].className);
            $('#test').text(k[1].testName);

            $('<li>', {
              id: 'test_' + runOrderIndex
            }).append([
              $('<p>', {
                id: "name_" + runOrderIndex,
                text: k[1].testName
              }).css({
                display: "inline"
              }),
              $('<p>', {
                id: "outcome_" + runOrderIndex,
                text: ":  " + k[1].outcome
              }).css({
                display: "inline"
              })
            ]).appendTo($('#testsList'));
          }
        }
        if (k[0] === 'status') {
         $('#status').text(k[1]);
        }
        if (k[0] === 'progress.phase') {
          $('#phase').text(k[1]);
        }
        if (k[0] === 'progress.completed') {
          console.log(k[1]);
          $('#complete').append('<p>' + k[1].moduleName + ' :: ' +
            k[1].className + ' :: ' + k[1].testName + ' :: ' +
            k[1].fixtureName + ' :: ' + k[1].phase + ' :: ' + k[1].outcome +
            ' :: ' + k[1].verifications + '</p>');

          // Scroll to bottom
          let scrollH = $('#complete').prop('scrollHeight');
          console.log("Scroll height: " + scrollH);
          $('#complete').scrollTop(scrollH);
        }
        if (k[0].indexOf('progress.activeSetups') === 0) {  // add or remove from list
          let re = /progress\.activeSetups\.?(\d*)/gm;
          let my = re.exec(k[0]);
          let activeIndex = my[1];
          if (!activeIndex) {
            // Complete list of active setup functions
            $('#activeSetups').text(k[1]);
          } else {
            // Addition of single element
            let current = $('#activeSetups').text();
            $('#activeSetups').text(current + ',' + k[1]);
          }

        }
      });
    }
  });
});


function saveSessionId() {
  let sessionId = $('#sessionId').val();
  localStorage.setItem("sessionId", sessionId);
  console.log("Set session ID to " + localStorage.getItem("sessionId"));
  location.reload();
}