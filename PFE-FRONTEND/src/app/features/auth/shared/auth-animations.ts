import { trigger, transition, style, animate, state } from '@angular/animations';

export const tabSlideAnimation = trigger('tabSlide', [
  state('login', style({
    opacity: 1
  })),
  state('register', style({
    opacity: 1
  })),
  transition('login => register', [
    animate('0ms')
  ]),
  transition('register => login', [
    animate('0ms')
  ])
]);

export const fadeInUp = trigger('fadeInUp', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(20px)' }),
    animate('400ms 100ms ease-out', style({ opacity: 1, transform: 'translateY(0)' }))
  ]),
  transition(':leave', [
    animate('200ms ease-in', style({ opacity: 0, transform: 'translateY(20px)' }))
  ])
]);

export const modalAnimation = trigger('modal', [
  transition(':enter', [
    style({ 
      opacity: 0,
      transform: 'scale(0.95) translateY(20px)'
    }),
    animate('300ms ease-out', style({ 
      opacity: 1,
      transform: 'scale(1) translateY(0)'
    }))
  ]),
  transition(':leave', [
    animate('200ms ease-in', style({ 
      opacity: 0,
      transform: 'scale(0.95) translateY(20px)'
    }))
  ])
]);
