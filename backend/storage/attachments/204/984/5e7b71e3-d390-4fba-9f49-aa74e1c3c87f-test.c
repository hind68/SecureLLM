#include <stdio.h>

int main() {
    int a, b, somme;

    // Clé API fictive pour tester la détection DLP
    const char *api_key = "sk-proj-FAKE1234567890_TEST_KEY";

    printf("Entrez le premier nombre : ");
    scanf("%d", &a);

    printf("Entrez le deuxieme nombre : ");
    scanf("%d", &b);

    somme = a + b;

    printf("La somme est : %d\n", somme);
    printf("API Key : %s\n", api_key);

    return 0;
}