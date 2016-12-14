import $ from 'jquery'

const topics = {}

export default function pubsub(id) {
  if (id == null) throw new Error('pubsub need an id')
  let topic = topics[id]
  if (topic) return topic
  const callbacks = $.Callbacks()
  topic = {
    publish:      callbacks.fire,
    subscribe:    callbacks.add,
    unsubscribe:  callbacks.remove,
  }
  topics[id] = topic
  return topic
}
