/* globals emulator */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function saveUncompressedStates(intervalMs, numSaves) {
  let dirHandle = await window.showDirectoryPicker();
  
  for (let i = 0; i < numSaves; i++) {
    const fileName = `v86state (${i}).bin`;
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    
    const buffer = await emulator.save_state()
    
    await writable.write(buffer);
    await writable.close();
    
    console.warn(`Saved ${fileName}`);
    await sleep(intervalMs);
  }
  
  console.warn("All files saved!");
}

async function saveStatesWithMetadata(intervalMs, numSaves) {
  let dirHandle = await window.showDirectoryPicker();
  
  // input saving code created with chatGPT
  const vmInputEvents = [];

  // Mouse move
  emulator.mouse_adapter.mousemove = function(x, y) {
      vmInputEvents.push({ type: "mouse_move", dx: x, dy: y, t: Date.now() });
      return origMouseMove(x, y);
  };

  // Mouse button
  emulator.mouse_adapter.mouse_button = function(button, is_pressed) {
      vmInputEvents.push({ type: "mouse_button", button, is_pressed, t: Date.now() });
      return origMouseButton(button, is_pressed);
  };

  // Keyboard scancode
  emulator.bus.register("keyboard-code", function(code) {
      vmInputEvents.push({ type: "key_scancode", code, t: Date.now() });
  });
}

//change interval and number of states if wanted
saveUncompressedStates(1000, 10)