import './app.scss';
import { Fragment } from 'react';
import Taro from '@tarojs/taro';

// 全局错误捕获，防止 fs 错误中断业务流程
if (typeof window !== 'undefined') {
  const originalConsoleError = console.error;
  console.error = (...args) => {
    const errorMessage = args.join(' ');
    if (errorMessage.includes('not node js file system') || 
        errorMessage.includes('saaa_config.json') ||
        errorMessage.includes('node:fs')) {
      // 静默处理 fs 相关错误，避免中断业务逻辑
      console.warn('Ignored node fs error:', errorMessage);
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

// 捕获 Taro 事件错误
Taro.eventCenter.on('__error', (err) => {
  if (err.message && (
    err.message.includes('not node js file system') || 
    err.message.includes('saaa_config.json') ||
    err.message.includes('node:fs')
  )) {
    console.warn('Ignored fs error in Taro event:', err.message);
    return;
  }
});

function App({ children }) {
  return <Fragment>{children}</Fragment>;
}

export default App;
