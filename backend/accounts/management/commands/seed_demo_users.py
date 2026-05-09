"""
Django management command to create demo user accounts for testing.
Run: python manage.py seed_demo_users
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

DEMO_USERS = [
    {
        'email': 'admin@demo.local',
        'password': 'DemoPass123!',
        'role': 'admin',
        'is_staff': True,
        'is_superuser': True,
        'verified': True,
        'first_name': 'Admin',
        'last_name': 'User',
    },
    {
        'email': 'entrepreneur@demo.local',
        'password': 'DemoPass123!',
        'role': 'entrepreneur',
        'verified': True,
        'first_name': 'Founder',
        'last_name': 'Demo',
        'business_idea': 'AI-powered analytics platform for startups',
        'funding_required': '500000',
        'startup_documents': 'Pitch deck and financial model available',
    },
    {
        'email': 'investor@demo.local',
        'password': 'DemoPass123!',
        'role': 'investor',
        'verified': True,
        'first_name': 'Investor',
        'last_name': 'Demo',
        'investment_interest': 'Technology, SaaS, FinTech, HealthTech',
        'budget_range': '$50K - $500K per deal',
    },
]


class Command(BaseCommand):
    help = 'Create demo user accounts for testing'

    def handle(self, *args, **options):
        created_count = 0
        created_users = []
        
        for user_seed in DEMO_USERS:
            user_data = user_seed.copy()
            email = user_data.pop('email')
            password = user_data.pop('password')
            
            # Check if user already exists
            if User.objects.filter(email=email).exists():
                self.stdout.write(
                    self.style.WARNING(f'⚠️  User {email} already exists, skipping')
                )
                continue
            
            # Create user
            user = User.objects.create_user(
                email=email,
                password=password,
                **user_data
            )
            created_count += 1
            role = user_data.get('role', 'entrepreneur')
            created_users.append({'email': email, 'password': password, 'role': role})
            self.stdout.write(
                self.style.SUCCESS(f'✅ Created {email} ({role})')
            )
        
        self.stdout.write(
            self.style.SUCCESS(f'\n✅ Successfully created {created_count} demo user(s)')
        )
        self.stdout.write(self.style.WARNING('\n📋 Demo Credentials:\n'))
        for user in DEMO_USERS:
            self.stdout.write(
                f"  {user['role'].upper():12} | {user['email']:25} | DemoPass123!"
            )
