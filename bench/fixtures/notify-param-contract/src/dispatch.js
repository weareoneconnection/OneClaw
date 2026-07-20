// Builds a OneClaw message.notify step from a task event.
function buildNotifyStep(event) {
  return {
    action: 'message.notify',
    input: {
      channel: event.channel || 'telegram',
      text: event.text,
    },
  };
}

module.exports = { buildNotifyStep };
