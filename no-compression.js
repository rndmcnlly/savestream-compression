/* globals emulator */

// input tracking code made by chatGPT
function startVmInputTracking() {
  const vmInputEvents = [];
  let logging = true;

  // Preserve original methods
  const origMouseMove = emulator.mouse_adapter.mousemove.bind(
    emulator.mouse_adapter
  );
  const origMouseButton = emulator.mouse_adapter.mouse_button.bind(
    emulator.mouse_adapter
  );

  // Override mouse move
  emulator.mouse_adapter.mousemove = function (dx, dy) {
    if (logging) {
      vmInputEvents.push({
        type: "mouse_move",
        dx,
        dy,
        t: Date.now(),
      });
    }
    return origMouseMove(dx, dy);
  };

  // Override mouse button
  emulator.mouse_adapter.mouse_button = function (button, is_pressed) {
    if (logging) {
      vmInputEvents.push({
        type: "mouse_button",
        button,
        is_pressed,
        t: Date.now(),
      });
    }
    return origMouseButton(button, is_pressed);
  };

  // Register keyboard scancodes
  const keyboardHandler = function (code) {
    if (logging) {
      vmInputEvents.push({
        type: "key_scancode",
        code,
        t: Date.now(),
      });
    }
  };
  emulator.bus.register("keyboard-code", keyboardHandler);

  // Return controller
  return {
    events: vmInputEvents,
    stop: () => (logging = false),
    start: () => (logging = true),
    isLogging: () => logging,
  };
}


function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function saveStateLoop(intervalMs, numSaves, dirHandle) {
  for (let i = 0; i < numSaves; i++) {
    const fileName = `v86state (${i}).bin`;
    const fileHandle = await dirHandle.getFileHandle(fileName, {
      create: true,
    });
    const writable = await fileHandle.createWritable();

    const buffer = await emulator.save_state();

    await writable.write(buffer);
    await writable.close();

    console.warn(`Saved ${fileName}`);
    await sleep(intervalMs);
  }
}

async function saveUncompressedStates(intervalMs, numSaves) {
  let dirHandle = await window.showDirectoryPicker();
  await saveStateLoop(intervalMs, numSaves, dirHandle);
  console.warn("All files saved!");
}

async function saveStatesWithMetadata(intervalMs, numSaves) {
  let dirHandle = await window.showDirectoryPicker();
  
  const startTime = new Date().toISOString();    //saves in YYYY-MM-DDtime format 
  const inputTracker = startVmInputTracking();
  
  await saveStateLoop(intervalMs, numSaves, dirHandle);
  inputTracker.stop();
  console.warn("All files saved!");
  
  const vmSpecs = {
    ramMB: emulator.config.memory_size / (1024 * 1024),
    hda: emulator.config.hda?.url || null,
    cdrom: emulator.config.cdrom?.url || null,
    fda: emulator.config.fda?.url || null,
  }
  
  const metadata = {
    startTime: startTime,
    vmSpecs: vmSpecs,
    inputSequence: inputTracker.events
  }
  
  
}

//change interval and number of states if wanted
//saveUncompressedStates(1000, 10)
saveStatesWithMetadata(1000, 10);
