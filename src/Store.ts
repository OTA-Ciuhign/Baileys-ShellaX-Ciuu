import type { BaileysEventMap } from './Types/Events'
import type { WAMessage, WAMessageKey } from './Types/Message'
import type { Chat } from './Types/Chat'
import type { Contact } from './Types/Contact'

type EventEmitter = {
  on: (event: string, listener: (data: any) => void) => any
}

export function makeInMemoryStore(_options: any = {}) {
  const chats: Record<string, Chat> = {}
  const contacts: Record<string, Contact> = {}
  const messages: Record<string, { array: WAMessage[] }> = {}

  const store = {
    chats,
    contacts,
    messages,

    bind(ev: EventEmitter) {
      ev.on('messaging-history.set', (data: BaileysEventMap['messaging-history.set']) => {
        for (const chat of data.chats ?? []) {
          if (chat.id) chats[chat.id] = { ...chats[chat.id], ...chat }
        }
        for (const contact of data.contacts ?? []) {
          if (contact.id) contacts[contact.id] = { ...contacts[contact.id], ...contact }
        }
        for (const msg of data.messages ?? []) addMessage(msg)
      })

      ev.on('chats.upsert', (items: Chat[]) => {
        for (const chat of items) if (chat.id) chats[chat.id] = { ...chats[chat.id], ...chat }
      })

      ev.on('chats.update', (items: Partial<Chat>[]) => {
        for (const item of items) {
          if (item.id) chats[item.id] = { ...chats[item.id], ...item } as Chat
        }
      })

      ev.on('chats.delete', (ids: string[]) => {
        for (const id of ids) delete chats[id]
      })

      ev.on('contacts.upsert', (items: Contact[]) => {
        for (const item of items) if (item.id) contacts[item.id] = { ...contacts[item.id], ...item }
      })

      ev.on('contacts.update', (items: Partial<Contact>[]) => {
        for (const item of items) {
          if (item.id) contacts[item.id] = { ...contacts[item.id], ...item } as Contact
        }
      })

      ev.on('messages.upsert', ({ messages: items }: BaileysEventMap['messages.upsert']) => {
        for (const msg of items) addMessage(msg)
      })

      ev.on('messages.update', (items: BaileysEventMap['messages.update']) => {
        for (const item of items) {
          const jid = item.key.remoteJid
          const id = item.key.id
          if (!jid || !id) continue
          const existing = messages[jid]?.array.find(m => m.key.id === id)
          if (existing) Object.assign(existing, item.update)
        }
      })

      ev.on('messages.delete', (data: BaileysEventMap['messages.delete']) => {
        if ('all' in data) {
          delete messages[data.jid]
        } else {
          for (const key of data.keys) {
            const jid = key.remoteJid
            if (!jid) continue
            const entry = messages[jid]
            if (entry) entry.array = entry.array.filter(m => m.key.id !== key.id)
          }
        }
      })
    },

    loadMessage(jid: string, id: string) {
      return messages[jid]?.array.find(msg => msg.key.id === id)
    },

    toJSON() {
      return { chats, contacts, messages }
    },

    fromJSON(data: any) {
      Object.assign(chats, data?.chats ?? {})
      Object.assign(contacts, data?.contacts ?? {})
      Object.assign(messages, data?.messages ?? {})
    },

    async writeToFile(path: string) {
      const fs = await import('node:fs/promises')
      await fs.writeFile(path, JSON.stringify(store.toJSON()))
    },

    async readFromFile(path: string) {
      const fs = await import('node:fs/promises')
      const data = JSON.parse(await fs.readFile(path, 'utf8'))
      store.fromJSON(data)
    }
  }

  function addMessage(msg: WAMessage) {
    const jid = msg.key.remoteJid
    if (!jid) return
    if (!messages[jid]) messages[jid] = { array: [] }
    const list = messages[jid].array
    const index = list.findIndex(item => item.key.id === msg.key.id)
    if (index >= 0) list[index] = { ...list[index], ...msg }
    else list.push(msg)
  }

  return store
}
