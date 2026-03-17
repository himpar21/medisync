import React, { useEffect, useMemo, useRef, useState } from "react";

function normalizeOptions(options = []) {
  return options
    .map((option) => {
      if (typeof option === "string" || typeof option === "number") {
        const value = String(option);
        return { value, label: value, rawValue: option };
      }

      if (option && typeof option === "object") {
        const rawValue = option.value ?? option.id ?? option.label ?? "";
        const value = String(rawValue);
        const label = String(option.label ?? rawValue);
        return { value, label, rawValue };
      }

      return null;
    })
    .filter(Boolean);
}

const CustomSelect = ({
  id,
  value,
  onChange,
  options = [],
  placeholder = "Select",
  disabled = false,
  className = "",
  style,
}) => {
  const rootRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);

  const selectedIndex = useMemo(
    () => normalizedOptions.findIndex((option) => String(option.rawValue) === String(value)),
    [normalizedOptions, value]
  );
  const selectedOption = selectedIndex >= 0 ? normalizedOptions[selectedIndex] : null;

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [isOpen, selectedIndex]);

  const selectOption = (option) => {
    onChange?.(option.rawValue);
    setIsOpen(false);
  };

  const handleKeyDown = (event) => {
    if (disabled) return;

    if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setIsOpen(true);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isOpen && highlightedIndex >= 0 && normalizedOptions[highlightedIndex]) {
        selectOption(normalizedOptions[highlightedIndex]);
      } else {
        setIsOpen(true);
      }
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
      return;
    }

    if (!isOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        Math.min(current + 1, Math.max(0, normalizedOptions.length - 1))
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    }
  };

  return (
    <div
      ref={rootRef}
      className={`custom-select${isOpen ? " is-open" : ""}${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}
      style={style}
    >
      <button
        id={id}
        type="button"
        className="custom-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => !disabled && setIsOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      >
        <span className={`custom-select-value${selectedOption ? "" : " is-placeholder"}`}>
          {selectedOption?.label || placeholder}
        </span>
        <span className="custom-select-caret" />
      </button>

      {isOpen ? (
        <div className="custom-select-menu-wrap">
          <ul className="custom-select-menu" role="listbox" aria-labelledby={id}>
            {normalizedOptions.map((option, index) => {
              const isSelected = String(option.rawValue) === String(value);
              const isHighlighted = index === highlightedIndex;

              return (
                <li
                  key={`${option.value}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                >
                  <button
                    type="button"
                    className={`custom-select-option${isSelected ? " is-selected" : ""}${isHighlighted ? " is-highlighted" : ""}`}
                    onClick={() => selectOption(option)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <span>{option.label}</span>
                    {isSelected ? <span className="custom-select-check">Selected</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

export default CustomSelect;
