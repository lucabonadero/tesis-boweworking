import React, { useState, useEffect } from 'react';
import img1 from '../assets/frentebowe.jpg';
import img2 from '../assets/plantabajadim.png';
import img3 from '../assets/salareunionesdim.png';
import img4 from '../assets/terrazardadim.png';

import styles from '../styles/public/registrocliente.module.css'; // Asegurate de importar el CSS

export default function Carousel() {
  const images = [img1, img2, img3, img4];
  const [currentImage, setCurrentImage] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImage((prev) =>
        prev === images.length - 1 ? 0 : prev + 1
      );
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.carousel__container}>
      <div
        className={styles.carousel__slider}
        style={{
          transform: `translateX(-${currentImage * 100}%)`,
        }}
      >
        {images.map((image, index) => (
          <img
            key={index}
            src={image}
            alt={`Imagen ${index + 1}`}
            className={styles.carousel__image}
          />
        ))}
      </div>
    </div>
  );
}