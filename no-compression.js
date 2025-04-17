function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function saveUncompressedStates(intervalMs, numSaves) {
  let dirHandle = await window.showDirectoryPicker();
  
  for (let i = 0; i < numSaves; i++) {
    const fileName = `v86state (${i}).bin`;
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    
    const buffer = emulator.save_state()
    
    await writable.write(buffer);
    await writable.close();
    
    console.log(`Saved ${fileName}`);
    await sleep(intervalMs);
  }
  
  console.log("All files saved!");
}


 