import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthStorageService } from '../../core/services/auth-storage.service';

@Component({
  standalone: true,
  selector: 'app-welcome',
  imports: [CommonModule, RouterLink],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.scss'
})
export class WelcomeComponent {
  private readonly router = inject(Router);
  private readonly authStorage = inject(AuthStorageService);

  readonly heroStats = [
    { value: 'AES-256', label: 'Chiffrement des fichiers' },
    { value: '24/7', label: 'Supervision et audit' },
    { value: '3 rôles', label: 'User, tenant admin, superadmin' },
    { value: '100%', label: 'Traçabilité des accès' }
  ];

  readonly highlights = [
    {
      icon: '🔐',
      title: 'Chiffrement de bout en bout',
      text: 'Vos fichiers restent protégés avec une architecture pensée pour la confidentialité et la conformité.'
    },
    {
      icon: '🤝',
      title: 'Partage contrôlé',
      text: 'Créez des liens, suivez les accès et gardez une traçabilité claire de chaque action.'
    },
    {
      icon: '📊',
      title: 'Supervision en temps réel',
      text: 'Les administrateurs et tenant admins disposent de vues de gestion et de supervision dédiées.'
    }
  ];

  readonly enterpriseFeatures = [
    'Gestion des utilisateurs et des rôles par tenant',
    'Partage contrôlé avec historique et révocation',
    'Réclamations, notifications et audit centralisé',
    'Tableaux de bord dédiés pour les équipes de supervision'
  ];

  readonly subscriptionPlans = [
    {
      name: 'Starter',
      price: '0 DT',
      period: '/ mois',
      badge: 'Essai',
      description: 'Pour découvrir la plateforme et sécuriser les usages de base.',
      features: ['Stockage sécurisé', 'Partage simple', 'Historique des accès'],
      cta: 'Commencer gratuitement'
    },
    {
      name: 'Business',
      price: '49 DT',
      period: '/ mois',
      badge: 'Le plus choisi',
      description: 'Idéal pour les équipes qui veulent un vrai contrôle opérationnel.',
      features: ['Tenant administration', 'Notifications avancées', 'Tableaux de bord'],
      cta: 'Choisir Business',
      featured: true
    },
    {
      name: 'Enterprise',
      price: 'Sur devis',
      period: '',
      badge: 'Corporate',
      description: 'Pour les organisations qui veulent personnalisation, audit et gouvernance complète.',
      features: ['Politiques personnalisées', 'Supervision multi-tenant', 'Support prioritaire'],
      cta: 'Parler à un expert'
    }
  ];

  readonly discounts = [
    {
      title: 'Remise lancement',
      value: '-20%',
      text: 'Valable pour toute nouvelle entreprise qui active un abonnement Business ce mois-ci.'
    },
    {
      title: 'Engagement annuel',
      value: '-2 mois',
      text: 'Profitez de deux mois offerts avec la facturation annuelle sur les plans Business et Enterprise.'
    }
  ];

  readonly tenantShowcase = [
    { name: 'Alpha Logistics', domain: 'alpha-logistics.tn', plan: 'Business' },
    { name: 'Nova Health', domain: 'nova-health.tn', plan: 'Enterprise' },
    { name: 'Atlas Finance', domain: 'atlas-finance.tn', plan: 'Business' },
    { name: 'Cybra Tech', domain: 'cybra-tech.tn', plan: 'Starter' }
  ];

  readonly stats = [
    { value: '128+', label: 'Fichiers monitorés' },
    { value: '24', label: 'Partages actifs' },
    { value: '7', label: 'Alertes traitées' },
    { value: '99.9%', label: 'Disponibilité cible' }
  ];

  get hasSession(): boolean {
    return !!this.authStorage.getSession();
  }

  goPrimary(): void {
    if (this.hasSession) {
      const session = this.authStorage.getSession();
      if (session?.role === 'superadmin') {
        this.router.navigate(['/admin/dashboard']);
        return;
      }
      if (session?.role === 'tenant_admin') {
        this.router.navigate(['/tenant-admin/dashboard']);
        return;
      }
      this.router.navigate(['/user/dashboard']);
      return;
    }

    this.router.navigate(['/register']);
  }

  goLogin(): void {
    this.router.navigate(['/login']);
  }

  goRegister(): void {
    this.router.navigate(['/register']);
  }

  trackByIndex(index: number): number {
    return index;
  }
}
