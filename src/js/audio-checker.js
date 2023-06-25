async function getMedia(constraints) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
    // eslint-disable-next-line no-empty
  } catch (err) {
    console.log(err, 'Error in fetching audio permission');
  }
}

window.addEventListener('load', async () => {
  const audioStream = await getMedia({
    audio: true,
    video: false,
  });
  window.top.postMessage({ type: 'AUDIO_PERMISSION_RESULT', data: { isAudio: !!audioStream } }, '*');
  if (audioStream) {
    audioStream.getTracks().map((track) => audioStream.removeTrack(track));
  }
});
