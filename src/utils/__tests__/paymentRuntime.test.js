/* eslint-env jest */

describe('paymentRuntime', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('prefers weapp jsapi payload in weapp runtime', () => {
    const { resolveSubscriptionPaymentAction } = require('../paymentRuntime');

    const action = resolveSubscriptionPaymentAction(
      {
        payment: {
          timeStamp: '1',
          nonceStr: 'nonce',
          package: 'prepay_id=123',
          signType: 'RSA',
          paySign: 'sign',
        },
      },
      { runtime: 'weapp' }
    );

    expect(action).toEqual({
      kind: 'weapp_jsapi',
      payload: {
        timeStamp: '1',
        nonceStr: 'nonce',
        package: 'prepay_id=123',
        signType: 'RSA',
        paySign: 'sign',
      },
    });
  });

  test('maps h5 mweb url to redirect action and appends redirect_url', () => {
    const { resolveSubscriptionPaymentAction } = require('../paymentRuntime');

    const action = resolveSubscriptionPaymentAction(
      {
        payment: {
          mwebUrl: 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=123',
        },
      },
      {
        runtime: 'h5',
        returnUrl: 'https://gamevallies.com/#/pages/subscription/index',
      }
    );

    expect(action.kind).toBe('h5_redirect');
    expect(action.url).toContain('redirect_url=');
  });

  test('maps jsapi params in wechat browser to h5 jsapi action', () => {
    const { resolveSubscriptionPaymentAction } = require('../paymentRuntime');

    const action = resolveSubscriptionPaymentAction(
      {
        payment: {
          timeStamp: '1',
          nonceStr: 'nonce',
          package: 'prepay_id=123',
          signType: 'RSA',
          paySign: 'sign',
        },
      },
      {
        runtime: 'h5',
        isWechatBrowser: true,
      }
    );

    expect(action).toEqual({
      kind: 'wechat_h5_jsapi',
      payload: {
        timeStamp: '1',
        nonceStr: 'nonce',
        package: 'prepay_id=123',
        signType: 'RSA',
        paySign: 'sign',
      },
    });
  });

  test('maps launchable code_url to h5 redirect action', () => {
    const { resolveSubscriptionPaymentAction } = require('../paymentRuntime');

    const action = resolveSubscriptionPaymentAction(
      {
        payment: {
          code_url: 'weixin://wxpay/bizpayurl?pr=test',
        },
      },
      { runtime: 'h5' }
    );

    expect(action).toEqual({
      kind: 'h5_redirect',
      source: 'code_url',
      url: 'weixin://wxpay/bizpayurl?pr=test',
    });
  });
});
