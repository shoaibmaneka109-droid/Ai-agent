import React from 'react';

const Card = ({ children, className = '', title, actions }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-200 ${className}`}>
    {(title || actions) && (
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        {title && <h3 className="text-base font-semibold text-gray-900">{title}</h3>}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    )}
    <div className="px-6 py-4">{children}</div>
  </div>
);

export default Card;
