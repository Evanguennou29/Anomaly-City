/** Explication pédagogique placée sous la courbe du score d'anomalie. */
export function HowItWorks() {
  return (
    <details className="panel how-it-works">
      <summary>Comment fonctionne le modèle ?</summary>
      <div className="how-body">
        <p>
          Un <strong>autoencodeur</strong> est un réseau de neurones qui apprend à <em>recopier</em> son entrée à
          travers un goulot d'étranglement. On ne lui montre que des journées <strong>normales</strong> : il apprend
          les corrélations habituelles entre électricité, trafic et latence des 6 quartiers.
        </p>
        <p>
          À chaque instant, le modèle tente de reconstruire les 18 capteurs. Le <strong>score d'anomalie</strong> est
          l'écart entre l'entrée et cette reconstruction : plus l'écart est grand, plus la situation est inhabituelle.
        </p>
        <p>
          Le <strong>seuil</strong> n'est pas arbitraire : il est calibré sur un jeu de validation normal
          (99<sup>e</sup> centile des erreurs). Quand le score dépasse ce seuil de façon persistante, l'incident est
          signalé, et l'on remonte aux capteurs qui ont le plus contribué à l'erreur.
        </p>
        <p className="how-note">
          ⚠️ Toutes les données et métriques de cette démonstration sont <strong>100 % simulées</strong>, générées de
          façon reproductible dans votre navigateur. Aucune donnée réelle n'est utilisée.
        </p>
      </div>
    </details>
  );
}
