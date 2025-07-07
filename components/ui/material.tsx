import React from "react"

export const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => (
  <button className={`material-button ${className || ""} ${variant || ""} ${size || ""}`} ref={ref} {...props} />
))
Button.displayName = "Button"

export const Box = ({ children, className, ...props }) => (
  <div className={`material-box ${className || ""}`} {...props}>
    {children}
  </div>
)

export const FormControlLabel = ({ control, label, className, ...props }) => (
  <label className={`material-form-control-label ${className || ""}`} {...props}>
    {control}
    <span>{label}</span>
  </label>
)

export const Switch = React.forwardRef(({ className, ...props }, ref) => (
  <input type="checkbox" className={`material-switch ${className || ""}`} ref={ref} {...props} />
))
Switch.displayName = "Switch"
