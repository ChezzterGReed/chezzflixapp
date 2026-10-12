// Which Plex profile is using the app right now, for the few things stored on this device that should still be kept per person.
let current = ''
export const setActiveProfile = (key: string) => { current = key }
export const activeProfile = () => current
