// LEAP - single-branch (main) declarative CI/CD pipeline for Windows & Linux agents
// Works with a standard Jenkins "Pipeline" job + GitHub webhook (/github-webhook/).
// Optional credential: "dockerhub" (username/password) when PUSH_IMAGES is enabled.

def runCmd(String cmd) {
  if (isUnix()) {
    sh cmd
  } else {
    bat "@echo off\r\n${cmd}"
  }
}

def runNpm(String args) {
  runCmd(isUnix() ? "npm ${args}" : "call npm ${args}")
}

def runNpx(String args) {
  runCmd(isUnix() ? "npx ${args}" : "call npx ${args}")
}

pipeline {
  agent any

  triggers {
    githubPush()
  }

  parameters {
    booleanParam(name: 'PUSH_IMAGES', defaultValue: false, description: 'Push built images to Docker Hub (requires dockerhub credential)')
    booleanParam(name: 'RUN_SEED', defaultValue: false, description: 'Force re-seed demo data after deploy')
  }

  options {
    disableConcurrentBuilds()
    timestamps()
    timeout(time: 30, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    REGISTRY = 'docker.io/garvitbajajj'
    TAG = "${env.BUILD_NUMBER}"
    CONTENT_ENCODER = 'tfidf'
  }

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Install') {
      parallel {
        stage('server') { steps { dir('server') { runNpm('ci') } } }
        stage('client') { steps { dir('client') { runNpm('ci') } } }
        stage('ml') {
          steps {
            dir('ml') {
              script {
                if (isUnix()) {
                  sh '''
                    [ -d .venv ] || python3 -m venv .venv
                    .venv/bin/python -m pip install --quiet -r requirements.txt
                  '''
                } else {
                  bat '''
                    @echo off
                    if not exist .venv python -m venv .venv
                    ".venv\\Scripts\\python.exe" -m pip install --quiet -r requirements.txt
                  '''
                }
              }
            }
          }
        }
      }
    }

    stage('Lint') {
      steps { dir('server') { runNpm('run lint') } }
    }

    stage('Unit Test') {
      parallel {
        stage('server - jest')  { steps { dir('server') { runNpx('jest --ci --coverage') } } }
        stage('ml - pytest') {
          steps {
            dir('ml') {
              script {
                if (isUnix()) {
                  sh '.venv/bin/python -m pytest -q --junitxml=pytest-results.xml'
                } else {
                  bat '@echo off\r\n".venv\\Scripts\\python.exe" -m pytest -q --junitxml=pytest-results.xml'
                }
              }
            }
          }
        }
        stage('client - vitest') { steps { dir('client') { runNpx('vitest run') } } }
        stage('e2e - maven') {
          steps {
            dir('tests/e2e') {
              script {
                if (isUnix()) {
                  sh 'mvn -B test'
                } else {
                  bat '''
                    @echo off
                    where mvn >nul 2>&1
                    if %ERRORLEVEL%==0 (
                      call mvn -B test
                    ) else (
                      call "C:\\Users\\abhil\\tools\\apache-maven-3.9.9\\bin\\mvn.cmd" -B test
                    )
                  '''
                }
              }
            }
          }
        }
      }
    }

    stage('API & E2E (live stack)') {
      when { expression { env.LEAP_E2E_URL?.trim() } }
      steps {
        runNpx("--yes newman run postman/LEAP.postman_collection.json -e postman/LEAP.local.postman_environment.json --env-var \"baseUrl=${env.LEAP_E2E_URL}\" --env-var \"apiBase=${env.LEAP_E2E_URL}/api/v1\" --insecure --reporters cli,junit --reporter-junit-export postman/newman-report.xml")
        dir('tests/e2e') {
          script {
            if (isUnix()) {
              sh "mvn -B verify -Dleap.baseUrl=${env.LEAP_E2E_URL} -Dleap.headless=true"
            } else {
              bat """
                @echo off
                where mvn >nul 2>&1
                if %ERRORLEVEL%==0 (
                  call mvn -B verify -Dleap.baseUrl=${env.LEAP_E2E_URL} -Dleap.headless=true
                ) else (
                  call "C:\\Users\\abhil\\tools\\apache-maven-3.9.9\\bin\\mvn.cmd" -B verify -Dleap.baseUrl=${env.LEAP_E2E_URL} -Dleap.headless=true
                )
              """
            }
          }
        }
      }
    }

    stage('Build') {
      steps { dir('client') { runNpm('run build') } }
    }

    stage('Docker Images') {
      steps {
        runCmd("docker build -t ${env.REGISTRY}/leap-server:${env.TAG} server")
        runCmd("docker build -t ${env.REGISTRY}/leap-ml:${env.TAG} ml")
        runCmd("docker build -t ${env.REGISTRY}/leap-client:${env.TAG} client")
      }
    }

    stage('Push') {
      when { expression { params.PUSH_IMAGES == true } }
      steps {
        withCredentials([usernamePassword(credentialsId: 'dockerhub', usernameVariable: 'DH_USER', passwordVariable: 'DH_PASS')]) {
          script {
            if (isUnix()) {
              sh '''
                echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin
                for s in server ml client; do docker push $REGISTRY/leap-$s:$TAG; done
              '''
            } else {
              bat '''
                @echo off
                echo %DH_PASS%| docker login -u "%DH_USER%" --password-stdin
                for %%s in (server ml client) do docker push %REGISTRY%/leap-%%s:%TAG%
              '''
            }
          }
        }
      }
    }

    stage('Deploy') {
      steps {
        runCmd('docker compose -p leap down --remove-orphans')
        runCmd('docker compose -p leap build')
        runCmd('docker compose -p leap up -d --wait mongo redis')
        runCmd('docker compose -p leap up -d --wait ml')
        runCmd('docker compose -p leap up -d --wait server client')
        script {
          def rawOut = ''
          if (isUnix()) {
            rawOut = sh(script: 'docker compose -p leap exec -T mongo mongosh --quiet leap --eval "db.users.countDocuments()"', returnStdout: true)
          } else {
            rawOut = bat(script: '@docker compose -p leap exec -T mongo mongosh --quiet leap --eval "db.users.countDocuments()"', returnStdout: true)
          }
          def lines = rawOut.readLines().findAll { it.trim() }
          def userCount = lines ? lines[-1].trim() : '0'
          if (params.RUN_SEED == true || userCount == '0') {
            echo "Seeding LEAP database (RUN_SEED=${params.RUN_SEED}, existing users=${userCount})..."
            runCmd('docker compose -p leap --profile seed run --rm seed')
          } else {
            echo "Database already has ${userCount} user(s); skipping seed."
          }
        }
        echo 'LEAP website is live at https://localhost:8443 (HTTP :8088 redirects to HTTPS)'
        echo 'Swagger UI: https://localhost:8443/api/v1/docs | ML Docs: http://localhost:8000/docs'
      }
    }
  }

  post {
    always {
      junit allowEmptyResults: true, testResults: 'ml/pytest-results.xml,tests/e2e/target/surefire-reports/*.xml,tests/e2e/target/failsafe-reports/*.xml,postman/newman-report.xml'
      archiveArtifacts allowEmptyArchive: true, artifacts: 'server/coverage/**,tests/e2e/target/screenshots/**'
    }
    success { echo 'LEAP pipeline passed' }
    failure { echo 'LEAP pipeline failed - check the stage logs above' }
  }
}
