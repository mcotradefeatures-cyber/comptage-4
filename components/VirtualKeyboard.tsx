
import React from 'react';

interface VirtualKeyboardProps {
  onKeyPress: (key: string) => void;
  onClear: () => void;
  onValidate: () => void;
  onShowHistory: () => void;
  theme: 'color' | 'day' | 'night';
  isLocked: boolean;
}

const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({ 
  onKeyPress, 
  onClear, 
  onValidate, 
  onShowHistory,
  theme,
  isLocked
}) => {
  const buttonBaseClass = `
    flex items-center justify-center rounded-xl text-lg font-bold
    transition-all w-full h-full active:scale-95 cursor-pointer border
  `;

  const getBtnStyles = () => {
    switch (theme) {
      case 'day':
        return {
          container: 'bg-white border-[#666666]',
          num: 'bg-white text-[#000000] border-[#666666]',
          ok: 'bg-[#000000] text-white border-transparent',
          clear: 'bg-white text-[#000000] border-[#666666]',
          history: 'bg-white text-[#000000] border-[#666666]'
        };
      case 'night':
        return {
          container: 'bg-[#1a1a1a] border-[#333]',
          num: 'bg-[#2a2a2a] text-white border-[#444]',
          ok: 'bg-white text-[#1a1a1a] border-transparent',
          clear: 'bg-[#333] text-white border-[#444]',
          history: 'bg-[#333] text-white border-[#444]'
        };
      case 'color':
      default:
        return {
          container: 'bg-[#f8f9fa] border-[#e0e0e0]',
          num: 'bg-white text-[#2d2d2d] border-[#e0e0e0]',
          ok: 'bg-[#1976d2] text-white border-transparent',
          clear: 'bg-white text-[#1976d2] border-[#e0e0e0]',
          history: 'bg-white text-[#2d2d2d] border-[#e0e0e0]'
        };
    }
  };

  const styles = getBtnStyles();
  const numBtnClass = `${buttonBaseClass} ${styles.num}`;

  return (
    <div className={`p-1.5 rounded-xl border transition-colors duration-300 ${styles.container}`}>
      <div className="grid grid-cols-4 grid-rows-4 gap-1.5 h-[26vh] min-h-[150px] max-h-[210px]">
        <button onClick={() => onKeyPress('7')} className={numBtnClass}>7</button>
        <button onClick={() => onKeyPress('8')} className={numBtnClass}>8</button>
        <button onClick={() => onKeyPress('9')} className={numBtnClass}>9</button>
        <button onClick={onClear} className={`${buttonBaseClass} ${styles.clear} text-base`}>
          <i className="fa-solid fa-delete-left"></i>
        </button>

        <button onClick={() => onKeyPress('4')} className={numBtnClass}>4</button>
        <button onClick={() => onKeyPress('5')} className={numBtnClass}>5</button>
        <button onClick={() => onKeyPress('6')} className={numBtnClass}>6</button>
        <button
          onClick={onValidate}
          className={`${buttonBaseClass} row-span-3 ${styles.ok} text-xl font-black`}
        >
          OK
        </button>

        <button onClick={() => onKeyPress('1')} className={numBtnClass}>1</button>
        <button onClick={() => onKeyPress('2')} className={numBtnClass}>2</button>
        <button onClick={() => onKeyPress('3')} className={numBtnClass}>3</button>

        <button 
          onClick={onShowHistory} 
          className={`${buttonBaseClass} ${styles.history}`}
        >
          <i className="fa-solid fa-list-ul text-xs"></i>
        </button>
        <button onClick={() => onKeyPress('0')} className={numBtnClass}>0</button>
        <button onClick={() => onKeyPress('.')} className={numBtnClass}>.</button>
      </div>
    </div>
  );
};

export default VirtualKeyboard;
