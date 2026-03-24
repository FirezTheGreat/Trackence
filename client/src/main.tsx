import { createRoot } from 'react-dom/client'
import { createHead, UnheadProvider } from '@unhead/react/client'
import './styles/global.css'
import App from './App.tsx'

const head = createHead()

createRoot(document.getElementById('root')!).render(
    <UnheadProvider head={head}>
        <App />
    </UnheadProvider>,
)
