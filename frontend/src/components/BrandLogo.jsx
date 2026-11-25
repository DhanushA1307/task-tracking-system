import React from 'react';

export const BrandLogo = ({ textSize = 'text-2xl', padding = 'p-2' }) => {
  return (
      <span className={`${textSize} ${padding} font-semibold tracking-tight leading-none flex items-center`}>
        <span className="text-slate-800">in</span>
        <span className="text-brand-600 ml-[1px]">gage</span>
      </span>
    
    // <div className={`flex items-center justify-center select-none cursor-pointer ${className}`}>
    //   {/* Exact Ingage Logo styling as in theme-colour.png */}
    
    // </div>
  );
};

export default BrandLogo;

