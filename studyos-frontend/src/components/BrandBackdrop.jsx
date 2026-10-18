import React from 'react';
import studyosMark from '../assets/studyos-mark.png';

export const BrandBackdrop = () => {
  return (
    <div className="fixed-backdrop" aria-hidden="true">
      <div className="glow-orb glow-top-left" />
      <div className="glow-orb glow-bottom-right" />
      <div className="backdrop-aura" />
      <img src={studyosMark} alt="" className="backdrop-logo-mark" />
    </div>
  );
};

export default BrandBackdrop;

