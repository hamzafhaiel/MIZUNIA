import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, MapPin } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Brand } from './components.tsx'
import './login.css'

const demoEmail = 'demo@fas9ia.test'
const demoPassword = 'Fas9ia-Demo2026!'
const sessionKey = 'fas9ia-demo-session'

export function readDemoSession() {
  try {
    return sessionStorage.getItem(sessionKey) === 'active'
  } catch {
    return false
  }
}

export function saveDemoSession(active: boolean) {
  try {
    if (active) sessionStorage.setItem(sessionKey, 'active')
    else sessionStorage.removeItem(sessionKey)
  } catch {
    // The account remains usable until the current page closes or reloads.
  }
}

export function Login({ onSignIn }: { onSignIn: () => void }) {
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState(false)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const email = String(fields.get('email') ?? '').trim().toLowerCase()
    if (email !== demoEmail || fields.get('password') !== demoPassword) {
      setError(true)
      return
    }
    onSignIn()
  }

  return <main className="login-screen" lang="fr">
    <div className="login-layout">
      <div className="login-cover">
        <div className="command-brand"><Brand /><span>FAS9IA</span></div>
        <p><MapPin size={17} /> Borj Râs · Mahdia, Tunisie</p>
      </div>
      <section className="login-panel" aria-labelledby="login-title">
        <span className="login-mark"><LockKeyhole size={21} /></span>
        <h1 id="login-title">Connexion</h1>
        <p>Accède au tableau de bord de gestion de l’eau.</p>
        <form className="login-form" onSubmit={submit} onChange={() => setError(false)}>
          <label htmlFor="login-email">Adresse e-mail</label>
          <div className="login-field">
            <Mail size={17} aria-hidden="true" />
            <input id="login-email" name="email" type="email" autoComplete="username" placeholder="nom@exemple.tn" required />
          </div>
          <label htmlFor="login-password">Mot de passe</label>
          <div className="login-field">
            <LockKeyhole size={17} aria-hidden="true" />
            <input id="login-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" required />
            <button type="button" className="login-visibility" aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setVisible(!visible)}>
              {visible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
          {error && <p className="login-error" role="alert">Adresse e-mail ou mot de passe incorrect.</p>}
          <button type="submit" className="button login-submit">Se connecter <ArrowRight size={17} /></button>
        </form>
        <p className="login-caption">Accès avec un compte de démonstration.</p>
      </section>
    </div>
  </main>
}
