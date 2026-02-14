const display = document.querySelector("#display");
const keys = document.querySelector(".keys");

let expression = "0";

const updateDisplay = () => {
  display.value = expression;
};

const reset = () => {
  expression = "0";
  updateDisplay();
};

const append = (value) => {
  if (expression === "0" && value !== ".") {
    expression = value;
  } else {
    expression += value;
  }

  updateDisplay();
};

const removeLast = () => {
  expression = expression.length > 1 ? expression.slice(0, -1) : "0";
  updateDisplay();
};

const calculate = () => {
  try {
    const sanitized = expression.replace(/×/g, "*").replace(/÷/g, "/");
    const result = Function(`"use strict"; return (${sanitized})`)();

    if (!Number.isFinite(result)) {
      throw new Error("Invalid result");
    }

    expression = String(result);
  } catch {
    expression = "错误";
  }

  updateDisplay();
};

keys.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLButtonElement)) {
    return;
  }

  const { value, action } = target.dataset;

  if (action === "clear") {
    reset();
    return;
  }

  if (action === "delete") {
    removeLast();
    return;
  }

  if (action === "calculate") {
    calculate();
    return;
  }

  if (!value) {
    return;
  }

  if (expression === "错误") {
    expression = "0";
  }

  append(value);
});

window.addEventListener("keydown", (event) => {
  const allowed = /[0-9+\-*/.%]/;

  if (event.key === "Enter") {
    event.preventDefault();
    calculate();
    return;
  }

  if (event.key === "Backspace") {
    removeLast();
    return;
  }

  if (event.key.toLowerCase() === "c") {
    reset();
    return;
  }

  if (allowed.test(event.key)) {
    append(event.key);
  }
});
