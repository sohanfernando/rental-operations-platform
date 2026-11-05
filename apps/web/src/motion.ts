import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { type RefObject } from 'react';

gsap.registerPlugin(useGSAP);

export function useEntrance(scope: RefObject<HTMLElement | null>, selector: string, key?: string | number) {
  useGSAP(() => {
    const motion = gsap.matchMedia();
    motion.add('(prefers-reduced-motion: no-preference)', () => {
      const targets = scope.current?.querySelectorAll(selector);
      if (!targets?.length) return;

      gsap.from(targets, {
        y: 14,
        opacity: 0,
        duration: 0.46,
        stagger: { amount: 0.16 },
        ease: 'power2.out',
        clearProps: 'opacity,transform',
      });
    });
    return () => motion.revert();
  }, { scope, dependencies: [selector, key], revertOnUpdate: true });
}
