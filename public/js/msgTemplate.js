function getMarkup(msgData) {
  let levelChangeDisplay;
  if (userControls.tabs) {
    levelChangeDisplay = msgData.levelDisplay.levelChange;
  } else
    levelChangeDisplay = getDisplay(userControls.tabs);
  return `
  <div id="msg${msgData.index}" class="containerMessage" style="background: #DDDDDD" index="${msgData.index}">
    <p class="debug" title="developer info" style="display: ${getDisplay(userControls.dev)}">${msgData._id} [${msgData.parents}] [${msgData.parentIndices}] : ${msgData.numOfChildren}</p>
    <p class=${msgData.indexClass} title="Message Index" style="display: ${getDisplay(userControls.index)}">${msgData.index}</p>
    <p class="timestamp" title="Timestamp" style="display: ${getDisplay(userControls.ts)}">${msgData.timestamp}</p>
    <span class="spacer" style="display: ${getDisplay(userControls.tabs)};margin-left: ${msgData.levelDisplay.spacerWidth}px"></span>
    <span id="msg${msgData.index}upLevel" class="triangle-topright" style="display:${levelChangeDisplay};"></span>
    <p id="msg${msgData.index}fold" style="display: ${getDisplay(userControls.folding)};" title="${msgData.foldDisplay.tooltip}" class="container${msgData.foldDisplay.container}Fold">${msgData.foldDisplay.content}</p>
    <p class="logLevel" title="Log Level" style="display: ${getDisplay(userControls.levels)}">${msgData.level}</p>
    <p class="levelStep" title="Step" style="display: ${getDisplay(userControls.steps)}">${msgData.step}</p>
    <span class="triangle-right" style="display: ${getDisplay(userControls.levels)}"></span>
    <pre id="msg${msgData.index}content" class="None">${msgData.message}</pre>
    <span>&zwnj;</span>
  </div>`;
}

function getBasicMarkup(msgData) {
  return `
  <p id="basic${msgData.index}">${msgData.index} ${msgData.timestamp} ${msgData.message}</p>
  `;
}
