import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// 注册 PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .catch(() => { });
  });
}

// 页面冻结前保存输入草稿
window.addEventListener('pagehide', () => {
  const input = document.querySelector('.glass-input') as HTMLInputElement;
  if (input && input.value) {
    sessionStorage.setItem('myos_input_draft', input.value);
  }
});

// 页面重新加载后恢复输入草稿
window.addEventListener('load', () => {
  const draft = sessionStorage.getItem('myos_input_draft');
  if (draft) {
    // 延迟执行，等 React 渲染完
    setTimeout(() => {
      const input = document.querySelector('.glass-input') as HTMLInputElement;
      if (input) {
        input.value = draft;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      sessionStorage.removeItem('myos_input_draft');
    }, 500);
  }
});