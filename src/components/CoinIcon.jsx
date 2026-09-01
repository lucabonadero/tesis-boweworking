import React from "react";
import coinIcon from "../assets/coin-icon.svg";

/** Ícono de créditos: reemplaza WalletOutlined en todo lo que muestra saldo/créditos. */
export default function CoinIcon({ size = 14, color = "currentColor", style, ...props }) {
  return (
    <span
      role="img"
      aria-label="créditos"
      {...props}
      style={{
        display: "inline-block",
        verticalAlign: "-0.15em",
        width: size,
        height: size,
        backgroundColor: color,
        WebkitMaskImage: `url(${coinIcon})`,
        maskImage: `url(${coinIcon})`,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        ...style,
      }}
    />
  );
}
