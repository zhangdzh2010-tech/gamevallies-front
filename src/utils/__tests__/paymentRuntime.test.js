/* eslint-env jest */

describe('paymentRuntime', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('maps payUrl to redirect action', () => {
    const { resolveSubscriptionPaymentAction } = require('../paymentRuntime');

    const action = resolveSubscriptionPaymentAction(
      {
        payment: {
          payUrl: 'https://openapi.alipay.com/gateway.do?token=abc',
        },
      }
    );

    expect(action).toEqual({
      kind: 'h5_redirect',
      source: 'payUrl',
      url: 'https://openapi.alipay.com/gateway.do?token=abc',
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

  test('keeps redirect action when payUrl and legacy jsapi params coexist', () => {
    const { resolveSubscriptionPaymentAction } = require('../paymentRuntime');

    const action = resolveSubscriptionPaymentAction(
      {
        payment: {
          payUrl: 'https://openapi.alipay.com/gateway.do?token=abc',
          timeStamp: '1',
          nonceStr: 'nonce',
          package: 'prepay_id=123',
          signType: 'RSA',
          paySign: 'sign',
        },
      }
    );

    expect(action).toEqual({
      kind: 'h5_redirect',
      source: 'payUrl',
      url: 'https://openapi.alipay.com/gateway.do?token=abc',
    });
  });

  test('marks pure jsapi payload as unsupported', () => {
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
      }
    );

    expect(action).toEqual({
      kind: 'unsupported_jsapi',
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
