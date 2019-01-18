function getMarkup(msgData) {
  let levelChangeDisplay;
  if (userControls.tabs) {
    levelChangeDisplay = msgData.levelDisplay.levelChange;
  } else
    levelChangeDisplay = getDisplay(userControls.tabs);
  let logLevelSpacers = ``;
  for (let i=0; i<=msgData.levelDisplay.logLevelSpacers; i++) {
    logLevelSpacers += `<p class="logLevelSpacer ${msgData.levelClass}" style="display: ${getDisplay(userControls.tabs)};background: lightgray"></p>`
  }
  let tagElements = ``;
  msgData.tags.forEach(function (tag) {
    tagElements += `<pre class="tags">${tag}</pre>`
  });
  return `
  <div id="msg${msgData.index}" class="containerMessage" style="background: #DDDDDD" index="${msgData.index}">
    <p class="debug" title="developer info" style="display: ${getDisplay(userControls.dev)}">${msgData._id} [${msgData.parents}] [${msgData.parentIndices}] : ${msgData.numOfChildren}</p>
    <p class=${msgData.indexClass} title="Message Index" style="display: ${getDisplay(userControls.index)}">${msgData.index}</p>
    <p class="timestamp" title="Timestamp" style="display: ${getDisplay(userControls.ts)}">${msgData.timestamp}</p>
    <span class="spacer" style="display: ${getDisplay(userControls.tabs)};margin-left: ${msgData.levelDisplay.spacerWidth}px"></span>
    <span id="msg${msgData.index}upLevel" class="triangle-topright" style="display:${levelChangeDisplay};"></span>
    <p id="msg${msgData.index}fold" style="display: ${getDisplay(userControls.folding)};" title="${msgData.foldDisplay.tooltip}" class="container${msgData.foldDisplay.container}Fold">${msgData.foldDisplay.content}</p>
    ${logLevelSpacers}
    <p class="logLevel ${msgData.levelClass}" title="Log Level" style="display: ${getDisplay(userControls.levels)};">${msgData.level}</p>
    <p class="levelStep ${msgData.levelClass}" title="Step" style="display: ${getDisplay(userControls.steps)}">${msgData.step}</p>
    <span class="triangle-right tr-${msgData.levelClass}" style="display: ${getDisplay(userControls.levels)}"></span>
    <pre id="msg${msgData.index}content" class=${msgData.msgClass}>${msgData.message}</pre>
    <div class="rightSideContainer">
      ${tagElements}
    </div>
    <span>&zwnj;</span>
  </div>`;
}

function getBasicMarkup(msgData) {
  return `
  <p id="basic${msgData.index}">${msgData.index} ${msgData.timestamp} ${msgData.message}</p>
  `;
}
