/* globals MessagePack */

// unpacks an array buffer containing a v86 state into a header, info, and buffer segment
// params - (fileContent: ArrayBuffer)
// returns - {header: ArrayBuffer, infoSegment: ArrayBuffer, bufferSegment: ArrayBuffer}
function unpack(fileContent) {
  const blockStart = 16;
  const infoLenIndex = 3;

  let header = fileContent.slice(0, blockStart);

  // get infoLen from header
  let headerDV = new DataView(header);
  let infoLen = headerDV.getInt32(infoLenIndex * 4, true); // Set to true for little-endian, false for big-endian

  let infoSegment = fileContent.slice(blockStart, blockStart + infoLen);

  // align bufferOffset to the next multiple of 4 (32 bit = 4 bytes)
  let bufferOffset = blockStart + infoLen;
  bufferOffset = (bufferOffset + 3) & ~3;

  let bufferSegment = fileContent.slice(bufferOffset);

  return { header, infoSegment, bufferSegment };
}

// takes in header, infoSegment, and bufferSegment and reconstructs original buffer
// params - (header: ArrayBuffer, infoSegment: ArrayBuffer, bufferSegment: ArrayBuffer)
// returns - fileContent: ArrayBuffer
function repack({ header, infoSegment, bufferSegment }) {
  // find padded info segment total length
  let infoLen = infoSegment.byteLength;
  let padding = ((infoLen + 3) & ~3) - infoLen;

  // create new arraybuffer for paddedInfoSegment
  let paddedInfoSegment = new Uint8Array(infoLen + padding);
  paddedInfoSegment.set(new Uint8Array(infoSegment));

  // create fileContent array buffer with total length of header, padderInfoSegment, and bufferSegment
  let fileContent = new Uint8Array(
    header.byteLength + paddedInfoSegment.byteLength + bufferSegment.byteLength
  );

  // populate final buffer
  fileContent.set(new Uint8Array(header), 0);
  fileContent.set(paddedInfoSegment, header.byteLength);
  fileContent.set(
    new Uint8Array(bufferSegment),
    header.byteLength + paddedInfoSegment.byteLength
  );

  return fileContent.buffer;
}

// aligns all buffers in buffer segment to an alignment of specified block size
// params - (infoSegment: ArrayBuffer, bufferSegment: ArrayBuffer, blockSize: int)
// returns - alignedBuffer: arrayBuffer
function align(infoSegment, bufferSegment, blockSize) {
  let info = JSON.parse(new TextDecoder("utf-8").decode(infoSegment));

  let alignedBlocks = [];
  for (let bufferInfo of info.buffer_infos) {
    let offset = bufferInfo.offset;
    let length = bufferInfo.length;

    // calculate padding to align length to blockSize
    let paddingLength = (blockSize - (length % blockSize)) % blockSize;

    // extract raw block and create new array with padding
    let rawBlock = new Uint8Array(bufferSegment, offset, length);
    let expandedBlock = new Uint8Array(length + paddingLength);
    expandedBlock.set(rawBlock);

    alignedBlocks.push(expandedBlock);
  }

  // concatenate all blocks into single array buffer
  let totalSize = alignedBlocks.reduce((sum, block) => sum + block.length, 0);
  let alignedBuffer = new Uint8Array(totalSize);

  let offset = 0;
  for (let block of alignedBlocks) {
    alignedBuffer.set(block, offset);
    offset += block.length;
  }

  return alignedBuffer.buffer;
}

// unaligns buffer segment to default alignment used by v86
// params - (infoSegment: ArrayBuffer, alignedBuffer: ArrayBuffer, blockSize: int)
// returns - bufferSegment: ArrayBuffer
function unalign(infoSegment, alignedBuffer, blockSize) {
  let info = JSON.parse(new TextDecoder("utf-8").decode(infoSegment));

  let unalignedBlocks = [];
  let offset = 0;

  for (let bufferInfo of info.buffer_infos) {
    let length = bufferInfo.length;
    let paddingLength = (blockSize - (length % blockSize)) % blockSize;

    // remove padding from aligned buffers
    let rawBlock = new Uint8Array(alignedBuffer, offset, (length + 3) & ~3);

    offset += length + paddingLength;
    unalignedBlocks.push(rawBlock);
  }

  //concatenate all blocks into single array buffer
  let totalSize = unalignedBlocks.reduce((sum, block) => sum + block.length, 0);
  let bufferSegment = new Uint8Array(totalSize);

  let writeOffset = 0;
  for (let block of unalignedBlocks) {
    bufferSegment.set(block, writeOffset);
    writeOffset += block.length;
  }

  return bufferSegment.buffer;
}

// finds unique blocks of current buffer segment, given a map of known blocks
// params - alignedBuffer: ArrayBuffer, uniqueBlockIds: Map<string, int>, blockSize: int
// returns - {newBlocks: Map<int, ArrayBuffer>, blockSequence: Array<int>}
function deduplicate(alignedBuffer, uniqueBlockIds, blockSize) {
  const decoder = new TextDecoder();
  const blockCount = Math.floor(alignedBuffer.byteLength / blockSize);

  // keeps track of unique blocks from this state
  const newBlocks = new Map();
  const blockSequence = [];

  for (let i = 0; i < blockCount; i++) {
    const offset = i * blockSize;
    const block = new Uint8Array(alignedBuffer, offset, blockSize); // a view into the large buffer

    const blockKey = decoder.decode(block);
    if (!uniqueBlockIds.has(blockKey)) {
      const id = uniqueBlockIds.size;
      uniqueBlockIds.set(blockKey, id);
      newBlocks.set(id, block.slice());
    }
    blockSequence.push(uniqueBlockIds.get(blockKey));
  }

  return { newBlocks, blockSequence };
}

// given known blocks and block sequence, reduplicates aligned buffer
// params - knownBlocks: Map<int, ArrayBuffer>, blockSequence: Array<int>
// returns - alignedBuffer: ArrayBuffer
function reduplicate(knownBlocks, blockSequence, blockSize) {
  const alignedBufferSegment = new Uint8Array(blockSize * blockSequence.length);
  for (let [i, blockId] of blockSequence.entries()) {
    const block = knownBlocks.get(blockId.toString());
    alignedBufferSegment.set(block, blockSize * i);
  }
  return alignedBufferSegment.buffer;
}

// encodes an array of state buffers
// params - savestateBuffers: Array<ArrayBuffer>
// returns - MessagePack.encode(Array<obj>)
function encodeSavestream(savestateBuffers) {
  const frames = [];
  const uniqueBlockIds = new Map();

  for (let buffer of savestateBuffers) {
    const { header, infoSegment, bufferSegment } = unpack(buffer);
    const blockSize = 256;
    const alignedBufferSegment = align(infoSegment, bufferSegment, blockSize);
    const { newBlocks, blockSequence } = deduplicate(
      alignedBufferSegment,
      uniqueBlockIds,
      blockSize
    );

    const frame = {
      header: new Uint8Array(header),
      infoSegment: new Uint8Array(infoSegment),
      blockSize,
      newBlocks: Object.fromEntries(newBlocks),
      blockSequence,
    };

    frames.push(frame);
  }
  return MessagePack.encode(frames);
}


function decodeSavestream(encodedSavestreamBuffer) {
  const frames = MessagePack.decode(encodedSavestreamBuffer);
  const knownBlocks = new Map();
  const savestateBuffers = [];
  for (let frame of frames) {
    const {header, infoSegment, blockSize, newBlocks, blockSequence} = frame;
    for (let [k,v] of Object.entries(newBlocks)) {
      knownBlocks.set(k,v);
    }
    const alignedBufferSegment = reduplicate(knownBlocks, blockSequence, blockSize);
    const bufferSegment = unalign(infoSegment, alignedBufferSegment, blockSize);
    const savestateBuffer = repack({
      header,
      infoSegment,
      bufferSegment
    });
    savestateBuffers.push(savestateBuffer);
  }
  return savestateBuffers;
}