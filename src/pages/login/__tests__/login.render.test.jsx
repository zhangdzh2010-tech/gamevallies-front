/* eslint-env jest */
import React from 'react';
import { render } from '@testing-library/react';

const mockShowToast = jest.fn();
const mockNavigateTo = jest.fn();
const mockLogin = jest.fn();
const mockHandleLoginBackNavigation = jest.fn();
const mockNavigateAfterLogin = jest.fn();
const mockIsWechatH5LoginEnabled = jest.fn(() => false);

jest.mock('@tarojs/components', () => {
  const ReactLib = require('react');
  const mockComponents = require('../../../test-utils/taroComponentsMock.jsx');

  return {
    ...mockComponents,
    Button: ReactLib.forwardRef(function Button({ children, ...props }, ref) {
      return (
        <button ref={ref} type="button" {...props}>
          {children}
        </button>
      );
    }),
  };
});

jest.mock('@tarojs/taro', () => {
  const api = {
    showToast: mockShowToast,
    navigateTo: mockNavigateTo,
    login: mockLogin,
  };

  return {
    __esModule: true,
    default: api,
    ...api,
  };
});

jest.mock('../../../utils/authNavigation', () => ({
  handleLoginBackNavigation: mockHandleLoginBackNavigation,
  navigateAfterLogin: mockNavigateAfterLogin,
}));

jest.mock('../../../utils/runtime', () => ({
  isH5Runtime: jest.fn(() => true),
  isWechatBrowserRuntime: jest.fn(() => true),
}));

jest.mock('../../../services/auth', () => ({
  isWechatH5LoginEnabled: (...args) => mockIsWechatH5LoginEnabled(...args),
  getWechatH5AuthParams: jest.fn(() => ({})),
  clearWechatH5AuthParams: jest.fn(),
  loginByWechatH5AuthCode: jest.fn(),
  sendSmsCode: jest.fn(),
  login: jest.fn(),
  loginByPhone: jest.fn(),
  startWechatH5Login: jest.fn(),
  loginByWechatMiniapp: jest.fn(),
}));

const LoginPage = require('../index').default;

describe('Login page wechat entrance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsWechatH5LoginEnabled.mockReturnValue(false);
    process.env.TARO_ENV = 'h5';
  });

  test('hides h5 wechat login entry when the switch is disabled', () => {
    const { container } = render(<LoginPage />);

    expect(mockIsWechatH5LoginEnabled).toHaveBeenCalled();
    expect(container.querySelector('.wechat-btn')).toBeNull();
    expect(container.querySelector('.divider')).toBeNull();
  });
});
