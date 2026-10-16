import { createContext, useContext } from 'react'

export const LangContext = createContext({ lang: 'fr' })
export const useLang = () => useContext(LangContext).lang
