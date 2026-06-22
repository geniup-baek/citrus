function readImageDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read image.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image.'))
    image.src = dataUrl
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Image compression failed.'))
        return
      }
      resolve(blob)
    }, type, quality)
  })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to encode image.'))
    reader.readAsDataURL(blob)
  })
}

export async function compressImageFile(
  file,
  {
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 0.78,
    outputType = 'image/jpeg',
  } = {},
) {
  const inputDataUrl = await readImageDataUrl(file)
  const sourceImage = await loadImage(inputDataUrl)

  const ratio = Math.min(maxWidth / sourceImage.width, maxHeight / sourceImage.height, 1)
  const targetWidth = Math.round(sourceImage.width * ratio)
  const targetHeight = Math.round(sourceImage.height * ratio)

  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas context is unavailable.')
  }

  ctx.drawImage(sourceImage, 0, 0, targetWidth, targetHeight)

  const compressedBlob = await canvasToBlob(canvas, outputType, quality)
  const compressedDataUrl = await blobToDataUrl(compressedBlob)

  return {
    dataUrl: compressedDataUrl,
    contentType: outputType,
    width: targetWidth,
    height: targetHeight,
    originalSize: file.size,
    compressedSize: compressedBlob.size,
    quality,
  }
}
