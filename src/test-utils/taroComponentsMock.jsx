import React from 'react';

function normalizeChildren(children) {
  return children === undefined ? null : children;
}

function omitUnsupportedDomProps(props = {}) {
  const {
    placeholderStyle,
    autoHeight,
    scrollX,
    scrollY,
    showScrollbar,
    refresherEnabled,
    refresherTriggered,
    lowerThreshold,
    onRefresherRefresh,
    onScrollToLower,
    ...rest
  } = props;

  void placeholderStyle;
  void autoHeight;
  void scrollX;
  void scrollY;
  void showScrollbar;
  void refresherEnabled;
  void refresherTriggered;
  void lowerThreshold;
  void onRefresherRefresh;
  void onScrollToLower;

  return rest;
}

export const View = React.forwardRef(function View({ children, ...props }, ref) {
  return (
    <div ref={ref} {...omitUnsupportedDomProps(props)}>
      {normalizeChildren(children)}
    </div>
  );
});

export const Text = React.forwardRef(function Text({ children, ...props }, ref) {
  return (
    <span ref={ref} {...omitUnsupportedDomProps(props)}>
      {normalizeChildren(children)}
    </span>
  );
});

export const ScrollView = React.forwardRef(function ScrollView({ children, ...props }, ref) {
  return (
    <div ref={ref} {...omitUnsupportedDomProps(props)}>
      {normalizeChildren(children)}
    </div>
  );
});

export const Image = React.forwardRef(function Image(props, ref) {
  return <img ref={ref} alt="" {...omitUnsupportedDomProps(props)} />;
});

export const Input = React.forwardRef(function Input(
  {
    value = '',
    onInput,
    maxlength,
    placeholder,
    className,
    ...props
  },
  ref
) {
  return (
    <input
      ref={ref}
      className={className}
      placeholder={placeholder}
      data-maxlength={maxlength}
      value={value}
      onChange={(event) => onInput?.({ detail: { value: event.target.value } })}
      {...omitUnsupportedDomProps(props)}
    />
  );
});

export const Textarea = React.forwardRef(function Textarea(
  {
    value = '',
    onInput,
    maxlength,
    placeholder,
    className,
    ...props
  },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={className}
      placeholder={placeholder}
      data-maxlength={maxlength}
      value={value}
      onChange={(event) => onInput?.({ detail: { value: event.target.value } })}
      {...omitUnsupportedDomProps(props)}
    />
  );
});
