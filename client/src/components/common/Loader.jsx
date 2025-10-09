import React from 'react';

const Loader = ({ message = "Loading..." }) => (
    <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="w-8 h-8 border-4 border-slate-300 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="mt-4 text-slate-600">{message}</p>
    </div>
);

export default Loader;