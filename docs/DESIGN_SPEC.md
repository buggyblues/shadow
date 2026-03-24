# Shadow Design System

> **Heterochromia (异色瞳)** — 双重特质，独特个性

---

## 品牌核心

**Shadow** 是一只异色瞳的猫。这不是一个随意的设计——它代表了品牌的本质：**双重特质、神秘魅力、独特个性**。

### 三色系统

| 颜色 | 色值 | 含义 |
|------|------|------|
| **Cyan Eye** | `#00F3FF` | 科技、AI、未来 |
| **Yellow Eye** | `#F8E71C` | 创造、活力、能量 |
| **Mystery** | `#FF6B9D` | 神秘、个性、独特 |

### 视觉表达

- **Aurora 背景** - 三色渐变光晕
- **Eye Animation** - 猫眼眨动效果
- **Glow Effects** - 品牌色光晕

---

## 色彩 Token

### 品牌色

```css
--eye-left: #F8E71C;   /* Yellow */
--eye-right: #00F3FF;  /* Cyan */
--mystery: #FF6B9D;    /* Pink */
```

### 渐变

```css
--gradient-eyes: linear-gradient(135deg, #00F3FF 0%, #F8E71C 100%);
--gradient-mystery: linear-gradient(135deg, #00F3FF 0%, #FF6B9D 50%, #F8E71C 100%);
--gradient-aurora: linear-gradient(180deg, 
  rgba(0, 243, 255, 0.15) 0%, 
  rgba(255, 107, 157, 0.1) 50%,
  rgba(248, 231, 28, 0.15) 100%);
```

### 光晕效果

```css
--glow-cyan: 0 0 30px rgba(0, 243, 255, 0.5), 0 0 60px rgba(0, 243, 255, 0.3);
--glow-yellow: 0 0 30px rgba(248, 231, 28, 0.5), 0 0 60px rgba(248, 231, 28, 0.3);
--glow-pink: 0 0 30px rgba(255, 107, 157, 0.5), 0 0 60px rgba(255, 107, 157, 0.3);
```

### 中性色

```css
--void: #050507;      /* 最深 */
--shadow: #0A0A0F;    /* 背景 */
--surface: #12121A;   /* 卡片 */
--elevated: #1A1A25;  /* 提升 */
--border: #252530;    /* 边框 */
```

---

## 字体

**Space Grotesk** — 几何、现代、有性格

---

## 圆角

| Token | 值 |
|-------|-----|
| `radius-sm` | 6px |
| `radius-md` | 10px |
| `radius-lg` | 14px |
| `radius-xl` | 20px |

---

## 组件风格

- **Button**: 品牌色填充 + hover 光晕
- **Input**: Focus 时品牌色边框 + 光晕
- **Card**: Hover 时品牌色边框 + 微浮
- **Avatar**: 三色渐变背景

---

## Demo

`demos/showcase.html`

---

*Shadow — The super community for super individuals*