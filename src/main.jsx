import { createRoot } from 'react-dom/client';
import '@fontsource/shrikhand/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './styles.css';
import { Tv } from './tv/Tv.jsx';
import { Admin } from './admin/Admin.jsx';
import { Editor } from './editor/Editor.jsx';
import { Player } from './player/Player.jsx';

const route = window.location.pathname.replace(/\/+$/, '');
const Page = { '/tv': Tv, '/admin': Admin, '/editor': Editor }[route] ?? Player;
document.body.dataset.page = route.slice(1) || 'player';

createRoot(document.getElementById('root')).render(<Page />);
