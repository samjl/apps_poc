function showHideIndex() {
  userControls.index = !userControls.index;
  updateActive();
}

function showHideTimestamp() {
  userControls.ts = !userControls.ts;
  updateActive();
}

function foldUnfoldAll() {
  let selector = document.getElementById("maxLevelDisplay");
  if ($("#foldUnfoldAll:checked").val() === "on") {
    userControls.foldAll = true;
    // TODO change 0 to min
    selector.value = 0;
    foldToLevel(0);
  } else {
    userControls.foldAll = false;
    // TODO change 5 to max
    selector.value = 5;
    foldToLevel(5);
  }
}

function hideLevels(selector) {
  let level = selector.value;
  // TODO? add level to userControls instead so it can be done at the templating stage
  // TODO change 1 to min
  if (level > 1) {
    userControls.foldAll = false;
    $("#foldUnfoldAll").prop('checked', false);
  } else {
    userControls.foldAll = true;
    $("#foldUnfoldAll").prop('checked', true);
  }
  foldToLevel(level);
}

function showHideFoldControls() {
  userControls.folding = !userControls.folding;
  updateActive();
}

function showHideTabs() {
  userControls.tabs = !userControls.tabs;
  updateActive();
}

function showHideLevelIndicators() {
  userControls.levels = !userControls.levels;
  updateActive();
}

function showHideStepIndicators() {
  userControls.steps = !userControls.steps;
  updateActive();
}

function showBasicLog() {
  if ($("#toggleBasic:checked").val() === "on") {
    activeHtml = [];
    allMsgs.forEach(function (msg) {
      let msgMarkup = getBasicMarkup(msg);
      activeHtml.push(msgMarkup);
      // Don't update the activeMsgIndices to match so we can return to the
      // same state when the checkbox is unchecked.
    })
  } else {
    activeHtml = [];
    for (let i=0; i<activeMsgIndices.length; i++) {
      activeHtml[i] = getMarkup(allMsgs[activeMsgIndices[i]-1]);
    }
  }
  clusterize.update(activeHtml);
  clusterize.refresh(true);
}

function showDevDebug() {
  // Note: unfolds all
  activeMsgIndices = [];
  if ($("#devDebug:checked").val() === "on") {
    allMsgs.forEach(function (msg) {
      activeMsgIndices.push(msg.index);
    });
  } else {
    allMsgs.forEach(function (msg) {
      if (!msg.message.startsWith("DEBUG(")) {
        activeMsgIndices.push(msg.index);
      }
    });
  }
  updateActive();
}

function foldToLevel(level) {
  activeMsgIndices= [];
  allMsgs.forEach(function (msg, index) {
    if (msg.numOfChildren > 0) {
      if (msg.level >= level) {
        // Mark all these as folded
        // console.log("Found a parent (index: " + msg.index + ", level: " + msg.level + ")");
        setParentFolded(index);
      } else {
        // All lower level parents are unfolded
        setParentUnfolded(index);
      }
    }
    if (msg.level <= level) {
      // console.log("Min log level to fold (index: " + msg.index + ", level: " + msg.level + ")");
      activeMsgIndices.push(msg.index);
    }
  });
  updateActive();
}
