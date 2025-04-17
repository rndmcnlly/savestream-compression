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

async function saveUncompressed

//change interval and number of states if wanted
saveUncompressedStates(1000, 10)