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
    // TODO change 1 to min
    selector.value = 1;
    foldToLevel(1);
  } else {
    userControls.foldAll = false;
    // TODO change 5 to max
    selector.value = 5;
    foldToLevel(5);
  }
}

function hideLevels(selector) {
  let level = selector.value;
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
}

function foldToLevel(level) {
  activeHtml = [];
  activeMsgIndices= [];
  allMsgs.forEach(function (msg) {
    if (msg.numOfChildren > 0) {
      if (msg.level >= level) {
        // Mark all these as folded
        console.log("Found a parent (index: " + msg.index + ", level: " + msg.level + ")");
        setParentFolded(msg.index-1);
      } else {
        // All lower level parents are unfolded
        setParentUnfolded(msg.index-1);
      }
    }
    if (msg.level <= level) {
      console.log("Min log level to fold (index: " + msg.index + ", level: " + msg.level + ")");
      activeMsgIndices.push(msg.index);
    }
  })
  updateActive();
}